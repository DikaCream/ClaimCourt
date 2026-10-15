"""Direct-mode tests for ClaimCourt (web pages and LLM answers are mocked)."""

import json

import pytest

from tests.direct.conftest import to_hex

CONTRACT = "contracts/claimcourt.py"
T0 = "2026-10-01T00:00:00Z"
CLAIM = ("The freelancer delivered the website two weeks after the agreed date of 1 September, "
         "so the claimant requests a 50 percent refund of the fee.")
STMT_C = "The signed contract states delivery by 1 September and the site went live on 15 September."
STMT_R = "Delivery was delayed because the claimant sent the brand assets on 10 September."
C_URL = "https://example.com/contract.html"
C_URL2 = "https://archive.org/web/site-launch"
R_URL = "https://example.org/emails.html"
X_URL = "https://example.net/extra.html"
C_PAGE = "Clause 4: The freelancer shall deliver the website by 1 September 2026. Launch was on 15 September."
R_PAGE = "Email of 10 September: Here are the brand assets you asked for, sorry for the delay."


def verdict(ruling, quote="shall deliver the website by 1 September 2026", src=C_URL):
    return json.dumps({"ruling": ruling, "evidence_quote": quote, "source_url": src, "reasoning": "per evidence"})


def pages(vm):
    vm.mock_web(r"example\.com", {"status": 200, "body": C_PAGE})
    vm.mock_web(r"archive\.org", {"status": 200, "body": "Archived launch page."})
    vm.mock_web(r"example\.org", {"status": 200, "body": R_PAGE})
    vm.mock_web(r"example\.net", {"status": 200, "body": "Extra exhibit text for the appeal round."})


def file_case(vm, c, who, resp, valid=True, urls=None, stake=200, rw=3600, rt=600, aw=300, at=600):
    vm.clear_mocks()
    vm.warp(T0)
    vm.mock_llm(r"screen new small-claims", json.dumps({"valid": valid, "reason": "ok" if valid else "Too vague"}))
    vm.sender = who
    return c.file_case("Late website delivery", CLAIM, "Refund 50 percent of the fee", "service",
                       to_hex(resp), STMT_C, urls if urls is not None else [C_URL, C_URL2], stake, rw, rt, aw, at)


def ready(vm, deploy, alice, bob, **kw):
    c = deploy(CONTRACT)
    for who in (alice, bob):
        vm.sender = who
        c.claim_points()
    case = file_case(vm, c, alice, bob, **kw)
    vm.sender = bob
    c.respond(case["id"], STMT_R, [R_URL])
    return c, case["id"]


def rule_with(vm, c, cid, llm, at="2026-10-01T00:02:00Z", sender=None):
    vm.clear_mocks()
    vm.warp(at)
    pages(vm)
    vm.mock_llm(r"strict, neutral judge", llm)
    if sender is not None:
        vm.sender = sender
    return c.rule(cid)


def bal(c, who):
    return c.get_user(to_hex(who))["balance"]


# ------------------------------------------------------------ filing


def test_file_valid_case(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    c.claim_points()
    case = file_case(direct_vm, c, direct_alice, direct_bob)
    assert case["status"] == "AWAITING_RESPONSE" and case["id"] == 0 and case["category"] == "SERVICE"
    assert case["claimant_evidence"] == [C_URL, C_URL2] and case["pot"] == 200
    assert bal(c, direct_alice) == 800
    assert direct_vm.run_validator() is True
    assert direct_vm.run_validator(leader_result={"valid": False, "reason": "x"}) is False


def test_frivolous_case_rejected_no_stake(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    c.claim_points()
    case = file_case(direct_vm, c, direct_alice, direct_bob, valid=False)
    assert case["status"] == "REJECTED" and "vague" in case["reject_reason"]
    assert bal(c, direct_alice) == 1000
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not awaiting"):
        c.respond(0, STMT_R, [R_URL])
    assert c.get_cases("REJECTED", 0, 10)["total"] == 1


@pytest.mark.parametrize("url,err", [
    ("http://example.com/x", "https"),
    ("https://bit.ly/abc", "shorteners"),
    ("https://192.168.1.1/x", "IP"),
    ("https://localhost/x", "not allowed"),
])
def test_url_rules(direct_vm, direct_deploy, direct_alice, direct_bob, url, err):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    c.claim_points()
    with direct_vm.expect_revert(err):
        file_case(direct_vm, c, direct_alice, direct_bob, urls=[url])


def test_filing_input_rules(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    c.claim_points()
    with direct_vm.expect_revert("1-3 evidence"):
        file_case(direct_vm, c, direct_alice, direct_bob, urls=[C_URL, C_URL2, R_URL, X_URL])
    with direct_vm.expect_revert("1-3 evidence"):
        file_case(direct_vm, c, direct_alice, direct_bob, urls=[])
    with direct_vm.expect_revert("Duplicate"):
        file_case(direct_vm, c, direct_alice, direct_bob, urls=[C_URL, C_URL])
    with direct_vm.expect_revert("Minimum stake"):
        file_case(direct_vm, c, direct_alice, direct_bob, stake=1)
    with direct_vm.expect_revert("Insufficient"):
        file_case(direct_vm, c, direct_alice, direct_bob, stake=5000)
    with direct_vm.expect_revert("60s to 14 days"):
        file_case(direct_vm, c, direct_alice, direct_bob, rt=5)
    with direct_vm.expect_revert("different wallet"):
        file_case(direct_vm, c, direct_alice, direct_alice)
    with direct_vm.expect_revert("Claim must"):
        direct_vm.sender = direct_alice
        c.file_case("Late website delivery", "too short", "Refund fee please", "SERVICE", to_hex(direct_bob),
                    STMT_C, [C_URL], 100, 300, 300, 300, 300)


def test_points_claim_once(direct_vm, direct_deploy, direct_alice):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    assert c.claim_points() == 1000
    with direct_vm.expect_revert("already claimed"):
        c.claim_points()


# ------------------------------------------------------------ respond / withdraw / no-response timeout


def test_respond_rules(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = direct_deploy(CONTRACT)
    for who in (direct_alice, direct_bob, direct_charlie):
        direct_vm.sender = who
        c.claim_points()
    file_case(direct_vm, c, direct_alice, direct_bob)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("named respondent"):
        c.respond(0, STMT_R, [R_URL])
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Statement must"):
        c.respond(0, "no", [R_URL])
    m = c.respond(0, STMT_R, [R_URL])
    assert m["status"] == "READY" and m["pot"] == 400 and bal(c, direct_bob) == 800
    with direct_vm.expect_revert("not awaiting"):
        c.respond(0, STMT_R, [R_URL])


def test_respond_after_deadline_reverts_and_expire_refunds(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    for who in (direct_alice, direct_bob):
        direct_vm.sender = who
        c.claim_points()
    file_case(direct_vm, c, direct_alice, direct_bob, rw=120)
    with direct_vm.expect_revert("not reached"):
        c.expire(0)
    direct_vm.warp("2026-10-01T00:05:00Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("deadline has passed"):
        c.respond(0, STMT_R, [R_URL])
    m = c.expire(0)
    assert m["status"] == "VOID" and m["void_reason"] == "NO_RESPONSE"
    assert bal(c, direct_alice) == 1000 and bal(c, direct_bob) == 1000
    assert c.get_evidence(0)[0]["kind"] == "TIMEOUT"


def test_withdraw(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    c.claim_points()
    file_case(direct_vm, c, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the claimant"):
        c.withdraw_case(0)
    direct_vm.sender = direct_alice
    m = c.withdraw_case(0)
    assert m["void_reason"] == "WITHDRAWN" and bal(c, direct_alice) == 1000
    with direct_vm.expect_revert("unanswered"):
        c.withdraw_case(0)


# ------------------------------------------------------------ rulings


def test_rule_claimant_and_settle(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    m = rule_with(direct_vm, c, cid, verdict("CLAIMANT"), sender=direct_charlie)
    assert m["status"] == "RULED" and m["ruling"] == "CLAIMANT" and m["appeal_open"] is True
    ev = c.get_evidence(cid)[0]
    assert ev["kind"] == "INITIAL" and ev["source_url"] == C_URL and "1 September" in ev["evidence_quote"]
    assert ev["sources"] == [C_URL, C_URL2, R_URL]
    assert direct_vm.run_validator() is True
    assert direct_vm.run_validator(leader_result={"ruling": "RESPONDENT", "evidence_quote": "x", "source_url": C_URL,
                                                 "reasoning": "r"}) is False
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("window still open"):
        c.finalize(cid)
    direct_vm.warp("2026-10-01T00:10:00Z")
    f = c.finalize(cid)
    assert f["status"] == "FINAL"
    assert bal(c, direct_alice) == 1200 and bal(c, direct_bob) == 800


def test_rule_respondent_wins(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    rule_with(direct_vm, c, cid, verdict("RESPONDENT", "sorry for the delay", R_URL))
    direct_vm.warp("2026-10-01T00:10:00Z")
    c.finalize(cid)
    assert bal(c, direct_alice) == 800 and bal(c, direct_bob) == 1200


def test_inconclusive_refunds(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    m = rule_with(direct_vm, c, cid, json.dumps({"ruling": "INCONCLUSIVE", "evidence_quote": "", "source_url": "",
                                                  "reasoning": "Evidence conflicts."}))
    assert m["ruling"] == "INCONCLUSIVE"
    direct_vm.warp("2026-10-01T00:10:00Z")
    c.finalize(cid)
    assert bal(c, direct_alice) == 1000 and bal(c, direct_bob) == 1000


def test_fabricated_quote_becomes_inconclusive(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    m = rule_with(direct_vm, c, cid, verdict("CLAIMANT", quote="x", src="https://evil.example/none"))
    assert m["ruling"] == "INCONCLUSIVE"
    assert "verbatim" in c.get_evidence(cid)[0]["reasoning"]


def test_fabricated_quote_fails_validator(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    rule_with(direct_vm, c, cid, verdict("CLAIMANT"))
    fake = {"ruling": "CLAIMANT", "evidence_quote": "the freelancer admitted everything", "source_url": C_URL,
            "reasoning": "r"}
    assert direct_vm.run_validator(leader_result=fake) is False


def test_all_evidence_down_inconclusive(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.clear_mocks()
    direct_vm.warp("2026-10-01T00:02:00Z")
    for pat in (r"example\.com", r"archive\.org", r"example\.org"):
        direct_vm.mock_web(pat, {"status": 500, "body": ""})
    assert c.rule(cid)["ruling"] == "INCONCLUSIVE"


def test_rule_state_and_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    for who in (direct_alice, direct_bob):
        direct_vm.sender = who
        c.claim_points()
    file_case(direct_vm, c, direct_alice, direct_bob)
    with direct_vm.expect_revert("not ready"):
        c.rule(0)
    direct_vm.sender = direct_bob
    c.respond(0, STMT_R, [R_URL])
    direct_vm.warp("2026-10-01T01:00:00Z")
    with direct_vm.expect_revert("Ruling deadline passed"):
        c.rule(0)


def test_ruling_timeout_refunds(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob, rt=120)
    direct_vm.warp("2026-10-01T00:01:00Z")
    with direct_vm.expect_revert("not reached"):
        c.expire(cid)
    direct_vm.warp("2026-10-01T00:05:00Z")
    m = c.expire(cid)
    assert m["status"] == "VOID" and m["void_reason"] == "RULING_TIMEOUT"
    assert bal(c, direct_alice) == 1000 and bal(c, direct_bob) == 1000


# ------------------------------------------------------------ appeals


def appeal_with(vm, c, cid, who, llm, extra=""):
    vm.sender = who
    vm.warp("2026-10-01T00:03:00Z")
    c.appeal(cid, "The first ruling ignored the signed delivery clause.", extra)
    vm.clear_mocks()
    pages(vm)
    vm.mock_llm(r"APPEAL ROUND", llm)
    return c.rule_appeal(cid)


def test_appeal_overturns(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    rule_with(direct_vm, c, cid, verdict("RESPONDENT", "sorry for the delay", R_URL))
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-10-01T00:03:00Z")
    a = c.appeal(cid, "The first ruling ignored the signed delivery clause.", X_URL)
    assert a["status"] == "APPEALED" and a["appellant"] == to_hex(direct_alice) and bal(c, direct_alice) == 700
    direct_vm.clear_mocks()
    pages(direct_vm)
    direct_vm.mock_llm(r"APPEAL ROUND", verdict("CLAIMANT"))
    m = c.rule_appeal(cid)
    assert m["status"] == "FINAL" and m["ruling"] == "CLAIMANT" and m["appeal_result"] == "OVERTURNED"
    assert bal(c, direct_alice) == 1200  # 700 + bond 100 back + pot 400
    assert bal(c, direct_bob) == 800
    ev = c.get_evidence(cid)
    assert [e["kind"] for e in ev] == ["INITIAL", "APPEAL"] and X_URL in ev[1]["sources"]
    assert c.get_stats()["overturned"] == 1


def test_appeal_upheld_forfeits_bond(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    rule_with(direct_vm, c, cid, verdict("CLAIMANT"))
    m = appeal_with(direct_vm, c, cid, direct_bob, verdict("CLAIMANT"))
    assert m["appeal_result"] == "UPHELD" and m["status"] == "FINAL"
    assert bal(c, direct_alice) == 800 + 400 + 100  # pot + forfeited bond
    assert bal(c, direct_bob) == 800 - 100


def test_appeal_to_inconclusive_counts_as_overturn(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    rule_with(direct_vm, c, cid, verdict("CLAIMANT"))
    m = appeal_with(direct_vm, c, cid, direct_bob, json.dumps(
        {"ruling": "INCONCLUSIVE", "evidence_quote": "", "source_url": "", "reasoning": "Merely arguable."}))
    assert m["appeal_result"] == "OVERTURNED" and m["ruling"] == "INCONCLUSIVE"
    assert bal(c, direct_alice) == 1000 and bal(c, direct_bob) == 1000


def test_appeal_rules(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("window is closed"):
        c.appeal(cid, "Not even ruled yet, trying anyway.", "")
    rule_with(direct_vm, c, cid, verdict("CLAIMANT"))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("prevailing party"):
        c.appeal(cid, "I won but want to appeal anyway.....", "")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only a party"):
        c.appeal(cid, "I am a stranger appealing this ruling.", "")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("20-500"):
        c.appeal(cid, "short", "")
    with direct_vm.expect_revert("shorteners"):
        c.appeal(cid, "A valid long reason for the appeal here.", "https://bit.ly/x")
    direct_vm.warp("2026-10-01T00:30:00Z")
    with direct_vm.expect_revert("window is closed"):
        c.appeal(cid, "A valid long reason for the appeal here.", "")


def test_appeal_needs_bond(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob, stake=950)
    rule_with(direct_vm, c, cid, verdict("CLAIMANT"))
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("appeal bond"):
        c.appeal(cid, "I cannot afford the bond but try anyway.", "")


def test_appeal_timeout_refunds_everything(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob, at=120)
    rule_with(direct_vm, c, cid, verdict("CLAIMANT"))
    direct_vm.sender = direct_bob
    direct_vm.warp("2026-10-01T00:03:00Z")
    c.appeal(cid, "The first ruling ignored my exhibit.......", "")
    assert bal(c, direct_bob) == 700
    direct_vm.warp("2026-10-01T00:04:00Z")
    with direct_vm.expect_revert("not reached"):
        c.expire(cid)
    direct_vm.warp("2026-10-01T00:10:00Z")
    with direct_vm.expect_revert("Appeal deadline passed"):
        c.rule_appeal(cid)
    m = c.expire(cid)
    assert m["void_reason"] == "APPEAL_TIMEOUT"
    assert bal(c, direct_alice) == 1000 and bal(c, direct_bob) == 1000


def test_expire_nothing_and_not_found(direct_vm, direct_deploy, direct_alice, direct_bob):
    c, cid = ready(direct_vm, direct_deploy, direct_alice, direct_bob)
    rule_with(direct_vm, c, cid, verdict("CLAIMANT"))
    with direct_vm.expect_revert("nothing to expire"):
        c.expire(cid)
    with direct_vm.expect_revert("not found"):
        c.get_case(99)
    with direct_vm.expect_revert("not under appeal"):
        c.rule_appeal(cid)


def test_views_and_pagination(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    for who in (direct_alice, direct_bob):
        direct_vm.sender = who
        c.claim_points()
    for _ in range(3):
        file_case(direct_vm, c, direct_alice, direct_bob, stake=10)
    page = c.get_cases("", 0, 2)
    assert page["total"] == 3 and [x["id"] for x in page["items"]] == [2, 1]
    assert c.get_cases("AWAITING_RESPONSE", 2, 5)["items"][0]["id"] == 0
    u = c.get_user(to_hex(direct_bob))
    assert [x["role"] for x in u["cases"]] == ["RESPONDENT"] * 3
    assert c.get_stats()["cases"] == 3 and c.get_config()["appeal_bond"] == 100
