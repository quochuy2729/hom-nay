"""Kiểm thử nhanh Hôm Nay bằng Playwright (Chromium headless).
Chạy:  pip install playwright && python3 tests/smoke.py
Không gọi Supabase: thư viện supabase-js bị chặn nên app chạy chế độ chỉ-trên-máy.
Giờ giả lập: Chủ nhật 18/10/2026 13:05, múi giờ Việt Nam."""
import os, sys, threading, http.server, functools, datetime
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
Handler.func.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
TZ = datetime.timezone(datetime.timedelta(hours=7))
res, errs = [], []
def ok(name, cond, extra=""): res.append((bool(cond), name, extra))

def page(b, persona, w=393, scheme="light"):
    ctx = b.new_context(viewport={"width": w, "height": 860}, timezone_id="Asia/Ho_Chi_Minh", color_scheme=scheme)
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    ctx.route("**/fonts.*/**", lambda r: r.abort())
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(f"{persona}: {e}"))
    pg.clock.install(time=datetime.datetime(2026, 10, 18, 13, 5, tzinfo=TZ))
    pg.goto(f"http://127.0.0.1:{PORT}/"); pg.evaluate("localStorage.setItem('hn-onboarded','1')"); pg.reload(); pg.wait_for_timeout(400)
    pg.evaluate(f"applyPersona('{persona}')"); pg.wait_for_timeout(100)
    return pg

with sync_playwright() as p:
    b = p.chromium.launch()
    for persona in ("sv", "work"):
        pg = page(b, persona)
        for tab in ("home", "task", "cal", "money", "gym"):
            if pg.locator(f"#nav [data-tab={tab}]").count():
                pg.click(f"#nav [data-tab={tab}]"); pg.wait_for_timeout(150)
                ok(f"{persona}: tab {tab} renders", pg.locator("main").inner_text().strip() != "")
        pg.click("#nav [data-tab=cal]"); pg.wait_for_timeout(200)
        # toast đã ẩn không được chặn bấm (lỗi v2.2.0: giữa nút không bấm được)
        pg.evaluate("toast('Đã lưu')"); pg.clock.run_for(3000); pg.wait_for_timeout(300)
        hit = pg.evaluate("() => { const t = document.querySelector('#toast').getBoundingClientRect(); const el = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return !!(el && el.closest('#toast')); }")
        ok(f"{persona}: hidden toast lets clicks through", not hit)
        # nút + ở tab Lịch: thêm việc cho ngày đang chọn
        pg.click("[data-mday='2026-10-23']"); pg.wait_for_timeout(150)
        pg.click("#fab"); pg.wait_for_timeout(400)
        ok(f"{persona}: + on Lịch opens task for selected day", pg.input_value(".sheet [name=due]") == "2026-10-23")
        has_sw = pg.locator(".sheet [data-addsw]").count() == 1
        ok(f"{persona}: Việc/Tiết học switch only when lịch học is on", has_sw == (persona == "sv"))
        if persona == "sv":
            pg.fill(".sheet [name=title]", "Giải tích 1"); pg.click(".sheet [data-addsw] [data-k=class]"); pg.wait_for_timeout(400)
            ok("sv: switch to class form keeps title", pg.locator(".sheet [name=t1]").count() == 1 and pg.input_value(".sheet [name=title]") == "Giải tích 1")
            pg.click(".sheet [data-addsw] [data-k=task]"); pg.wait_for_timeout(400)
            pg.click(".sheet [data-save]"); pg.wait_for_timeout(400)
            ok("sv: task saved with date", pg.evaluate("all('task').some(t => t.data.title === 'Giải tích 1' && t.data.due === '2026-10-23')"))
        # ghi nhanh bằng câu
        q = pg.evaluate("parseQuick('cơm trưa 35k')")
        ok(f"{persona}: quick parse 'cơm trưa 35k'", q and q["kind"] == "tx" and q["data"]["amount"] == 35000 and q["data"]["cat"] == "an", str(q)[:120])
        # âm lịch
        ok(f"{persona}: Tết 2027 = 6/2/2027", pg.evaluate("(() => { const l = LUNAR.of('2027-02-06'); return l.d === 1 && l.m === 1; })()"))
    b.close()

fails = [r for r in res if not r[0]]
for good, name, extra in res: print(("PASS " if good else "FAIL ") + name + (f"  {extra}" if extra and not good else ""))
print(f"\n{len(res) - len(fails)}/{len(res)} passed; page errors: {errs or 'none'}")
sys.exit(1 if fails or errs else 0)
