"""Kiểm thử nhanh Hôm Nay bằng Playwright (Chromium headless).
Chạy:  pip install playwright && python3 tests/smoke.py
Không gọi Supabase: thư viện supabase-js bị chặn nên app chạy chế độ chỉ-trên-máy.
Giờ giả lập: Chủ nhật 18/10/2026 13:05, múi giờ Việt Nam.
Cuối cùng chạy thêm tests/push_test.mjs (hàm hn-push) bằng Node."""
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

def page(b, persona, w=393, scheme="light", init=None):
    ctx = b.new_context(viewport={"width": w, "height": 860}, timezone_id="Asia/Ho_Chi_Minh", color_scheme=scheme)
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    ctx.route("**/fonts.*/**", lambda r: r.abort())
    if init: ctx.add_init_script(init)
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
        # dạng Tháng (mặc định) cũng có chỗ dán thời khóa biểu, không phải chuyển sang Tuần
        pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
        pg.click("#nav [data-tab=cal]"); pg.wait_for_timeout(200)
        is_month = pg.locator("main [data-mday]").count() > 0
        tkb_btn = pg.locator("main [data-act=tkb]")
        if persona == "sv":
            ok("sv: Lịch dạng Tháng có nút Dán thời khóa biểu", is_month and tkb_btn.count() == 1)
            if tkb_btn.count():
                pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(150)
                gap = pg.evaluate("document.querySelector('#fab').getBoundingClientRect().top - document.querySelector('main [data-act=tkb]').closest('.btns').getBoundingClientRect().bottom")
                ok("sv: cuộn hết trang thì nút + không che hàng nút dưới lịch", gap >= 8, f"cách {gap}px")
                tkb_btn.click(); pg.wait_for_timeout(400)
            ok("sv: bấm Dán thời khóa biểu mở form dán", pg.locator(".sheet textarea[name=src]").count() == 1)
            pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
        else:
            ok("work: Lịch không có nút dán khi tắt Lịch học", is_month and tkb_btn.count() == 0 and pg.locator("main [data-act=q-class]").count() == 0)
        # ghi nhanh bằng câu
        q = pg.evaluate("parseQuick('cơm trưa 35k')")
        ok(f"{persona}: quick parse 'cơm trưa 35k'", q and q["kind"] == "tx" and q["data"]["amount"] == 35000 and q["data"]["cat"] == "an", str(q)[:120])
        # âm lịch
        ok(f"{persona}: Tết 2027 = 6/2/2027", pg.evaluate("(() => { const l = LUNAR.of('2027-02-06'); return l.d === 1 && l.m === 1; })()"))

    # ---------- sao lưu và khôi phục JSON ----------
    SNAP = "() => JSON.stringify(Object.values(db).filter(r => !r.deleted).map(r => [r.id, r.kind, JSON.stringify(r.data), r.updated_at]).sort())"
    src = page(b, "sv")
    src.evaluate("""() => {
        navigator.canShare = undefined;   // ép tải file thay vì mở bảng chia sẻ
        put('task', { title: 'Nộp BTL', type: 'bai', due: '2026-10-23', time: '23:59', status: 'todo', subs: [] });
        put('tx', { type: 'out', amount: 35000, cat: 'an', note: 'cơm trưa', date: '2026-10-18', at: Date.now() });
        put('class', { title: 'Giải tích 1', days: [2], start: '07:00', end: '09:00', weeks: [1, 2, 3] });
        const gone = put('tx', { type: 'out', amount: 1, cat: 'an', note: 'xóa rồi', date: '2026-10-18', at: 1 }); remove(gone.id);
        setSetting('name', 'Huy');
    }""")
    src.click("[data-act=settings]"); src.wait_for_timeout(300)
    ok("backup: Cài đặt có nút Tải bản sao lưu và Khôi phục từ file",
       src.locator(".sheet [data-export]").inner_text().strip() == "Tải bản sao lưu" and src.locator(".sheet [data-importbtn]").inner_text().strip() == "Khôi phục từ file")
    with src.expect_download() as dl:
        src.click(".sheet [data-export]")
    import json, tempfile
    path = os.path.join(tempfile.mkdtemp(), "hom-nay.json"); dl.value.save_as(path)
    with open(path, encoding="utf-8") as f: bk = json.load(f)
    want = src.evaluate(SNAP)
    ok("backup: file có đủ bản ghi, không kèm bản đã xóa",
       bk.get("app") == "hom-nay" and len(bk["items"]) == src.evaluate("Object.values(db).filter(r => !r.deleted).length") and not any(i.get("deleted") for i in bk["items"]))
    src.context.close()

    dst = page(b, "work")   # máy khác, chưa có dữ liệu sv
    before = dst.evaluate("Object.keys(db).length")
    dst.click("[data-act=settings]"); dst.wait_for_timeout(300)
    dst.set_input_files(".sheet [data-import]", path); dst.wait_for_timeout(400)
    got = dst.evaluate(SNAP)
    ok("backup: nhập vào máy khác được đúng dữ liệu cũ", all(x in json.loads(got) for x in json.loads(want)), f"{len(json.loads(got))} vs {len(json.loads(want))}")
    ok("backup: bản ghi đã nhập được đưa vào hàng chờ đồng bộ", dst.evaluate(f"{json.dumps([i['id'] for i in bk['items']])}.every(id => queue[id])"))
    ok("backup: nhập xong hiện lại tên đã lưu", dst.evaluate("getSetting('name', '')") == "Huy")
    n1 = dst.evaluate("Object.keys(db).length")
    dst.clock.run_for(4000); dst.wait_for_timeout(200)
    dst.click("[data-act=settings]"); dst.wait_for_timeout(300)
    dst.set_input_files(".sheet [data-import]", path); dst.wait_for_timeout(400)
    ok("backup: nhập lần hai không sinh bản trùng", dst.evaluate("Object.keys(db).length") == n1 and dst.evaluate(SNAP) == got)
    ok("backup: lần hai báo không có gì mới", "0 mục mới" in dst.locator("#toast").inner_text(), dst.locator("#toast").inner_text())
    # bản trên máy mới hơn thì giữ nguyên, không bị bản sao lưu cũ đè
    tid = [i["id"] for i in bk["items"] if i["kind"] == "task"][0]
    dst.evaluate(f"put('task', {{ ...db['{tid}'].data, title: 'Nộp BTL (đã sửa)' }}, '{tid}')")
    stats = dst.evaluate("mergeBackup(" + json.dumps(bk) + ")")
    ok("backup: bản trên máy mới hơn thắng", dst.evaluate(f"db['{tid}'].data.title") == "Nộp BTL (đã sửa)" and stats["kept"] >= 1, str(stats))
    # file hỏng hoặc sai định dạng: không đụng tới dữ liệu
    n2 = dst.evaluate("Object.keys(db).length")
    bad = dst.evaluate("""() => [
        mergeBackup({ app: 'khac', items: [] }),
        mergeBackup({ app: 'hom-nay', items: [{ id: 'khong-phai-uuid', kind: 'task', data: {}, updated_at: '2026-10-01T00:00:00Z' },
                                               { id: crypto.randomUUID(), kind: 'task', data: {}, updated_at: 'hôm qua' }] })
    ]""")
    ok("backup: từ chối file không phải của Hôm Nay", bad[0] is None)
    ok("backup: bỏ qua bản ghi hỏng (id không phải uuid, ngày sai)", bad[1]["invalid"] == 2 and bad[1]["added"] == 0 and dst.evaluate("Object.keys(db).length") == n2, str(bad[1]))
    dst.context.close()

    # ---------- bộ nhớ đầy: không được mất dữ liệu âm thầm ----------
    qp = page(b, "sv")
    qp.evaluate("""() => {   // lấp đầy localStorage bằng rác cho tới khi trình duyệt từ chối
      let i = 0;
      for (const n of [262144, 16384, 1024, 64, 1]) { const chunk = 'x'.repeat(n); try { for (;;) localStorage.setItem('junk-' + i++, chunk); } catch {} }
    }""")
    qp.evaluate("put('task', { title: 'Việc lúc bộ nhớ đầy', type: 'bai', due: '2026-10-20', time: '', status: 'todo', subs: [] })"); qp.wait_for_timeout(300)
    warn = qp.locator("#storewarn")
    ok("quota: bộ nhớ đầy thì hiện cảnh báo cố định", warn.count() == 1 and warn.is_visible(), warn.inner_text() if warn.count() else "không có #storewarn")
    ok("quota: cảnh báo có nút Tải bản sao lưu", qp.locator("#storewarn [data-act=export]").count() == 1)
    ok("quota: việc vẫn còn trong app và hàng chờ đồng bộ", qp.evaluate("all('task').some(t => t.data.title === 'Việc lúc bộ nhớ đầy' && queue[t.id])"))
    qp.clock.run_for(5000); qp.wait_for_timeout(200)
    ok("quota: cảnh báo không tự biến mất như toast", warn.count() == 1 and warn.is_visible())
    # dọn bớt rồi ghi tiếp: lưu được, cảnh báo ẩn, reload vẫn còn việc
    qp.evaluate("Object.keys(localStorage).filter(k => k.startsWith('junk-')).forEach(k => localStorage.removeItem(k))")
    qp.evaluate("put('task', { title: 'Việc sau khi dọn', type: 'bai', due: '2026-10-21', time: '', status: 'todo', subs: [] })"); qp.wait_for_timeout(300)
    ok("quota: ghi được lại thì cảnh báo ẩn", warn.count() == 0 or not warn.is_visible())
    qp.reload(); qp.wait_for_timeout(400)
    ok("quota: reload vẫn còn việc ghi lúc bộ nhớ đầy", qp.evaluate("all('task').some(t => t.data.title === 'Việc lúc bộ nhớ đầy')"))
    qp.context.close()

    # ---------- XSS: dữ liệu người dùng không được thành thẻ HTML ----------
    # Bắt thẳng phần tử bị chèn vào DOM (không dựa vào onerror), nên vẫn đúng khi đã có CSP.
    XSS_INIT = """window.__xss = []; window.__csp = [];
      document.addEventListener('securitypolicyviolation', e => __csp.push(e.violatedDirective + ' ' + e.blockedURI));
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        [n, ...n.querySelectorAll('[data-xss]')].forEach(e => { const t = e.getAttribute('data-xss'); if (t && !__xss.includes(t)) __xss.push(t); });
      }))).observe(document, { subtree: true, childList: true });"""
    X = lambda tag: f"\"'><img data-xss={tag} src=x>"
    def visit_all(pg):
        pg.evaluate("""async () => {
          const wait = ms => new Promise(r => setTimeout(r, ms));
          for (const t of ['home', 'task', 'money', 'gym']) { ui.tab = t; render(); }
          ui.tab = 'task'; for (const f of ['waiting', 'done', 'todo']) { ui.taskFilter = f; render(); }
          ui.tab = 'cal'; ui.calView = 'month'; for (const d of ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']) { ui.calSel = d; render(); }
          ui.calView = 'week'; for (let d = 0; d < 7; d++) { ui.calDay = d; render(); }
          const sheets = [() => txForm(null), budgetForm, catsSheet, settingsSheet, docsSheet, icsSheet, chooser, () => workoutForm(null),
            () => weightForm(null), () => goalForm(null), () => taskForm(null), () => classForm(null)];
          for (const [k, f] of [['task', taskForm], ['class', classForm], ['tx', txForm], ['workout', workoutForm], ['weight', weightForm], ['goal', goalForm], ['doc', docForm]])
            all(k).forEach(r => sheets.push(() => f(r.id)));
          all('class').forEach(r => sheets.push(() => classDetail(r.id, '2026-10-19')));
          for (const f of sheets) { try { f(); } catch (e) { console.error(e); } await wait(30); closeSheet(); await wait(10); }
          searchSheet(); await wait(50);
          for (const q of ['x', 'img', 'a', '1']) { const i = document.querySelector('.sheet [name=q]'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); await wait(30); }
          closeSheet();
        }""")
        pg.clock.run_for(500); pg.wait_for_timeout(200)
        return pg.evaluate("__xss")
    import uuid
    def evil_items():
        items = []
        def it(kind, data): items.append({"id": str(uuid.uuid4()), "kind": kind, "data": data, "updated_at": "2026-10-18T05:00:00.000Z"})
        it("task", {"title": X("task_title"), "tag": X("task_tag"), "type": "thi", "due": "2026-10-20", "time": X("task_time"), "status": "todo", "note": X("task_note"),
                    "waitFor": X("task_waitFor"), "subs": [{"text": X("sub_text"), "who": X("sub_who")}], "amount": 50000, "cat": X("task_cat"), "repeat": X("task_repeat"), "until": X("task_until"), "dur": X("task_dur")})
        it("task", {"title": "w", "status": "waiting", "waitFor": X("task_waitFor2"), "due": "2026-10-19", "type": X("task_type")})
        it("task", {"title": "dueBad", "status": "todo", "due": X("task_due")})
        it("class", {"title": X("class_title"), "code": X("class_code"), "group": X("class_group"), "days": [1, X("class_days")], "start": X("class_start"), "end": X("class_end"),
                     "weeks": [], "room": X("class_room"), "teacher": X("class_teacher"), "credits": X("class_credits"), "absent": [X("class_absent")], "note": X("class_note")})
        it("tx", {"type": "out", "amount": X("tx_amount"), "cat": X("tx_cat"), "note": X("tx_note"), "date": "2026-10-18", "at": 1})
        it("tx", {"type": "out", "amount": 1000, "cat": "an", "note": "n", "date": X("tx_date"), "at": 1})
        it("workout", {"date": "2026-10-18", "mins": X("w_mins"), "items": [{"ex": X("w_ex"), "sets": [X("w_sets"), 5], "kg": X("w_kg")}], "note": X("w_note")})
        it("weight", {"date": "2026-10-18", "kg": X("weight_kg")})
        it("weight", {"date": "2026-09-10", "kg": 60})
        it("goal", {"name": X("goal_name"), "emoji": X("goal_emoji"), "target": X("goal_target"), "saved": X("goal_saved"), "deadline": X("goal_deadline")})
        it("doc", {"name": X("doc_name"), "fields": [{"k": X("doc_k"), "v": X("doc_v")}]})
        it("setting", {"key": "customCats", "value": [{"k": X("cat_k"), "n": X("cat_n"), "e": X("cat_e"), "t": "out"}]})
        it("setting", {"key": "name", "value": X("set_name")})
        it("setting", {"key": "budget", "value": X("set_budget")})
        it("setting", {"key": "catBudget", "value": {"an": X("set_catBudget")}})
        it("setting", {"key": "credits", "value": X("set_credits")})
        it("setting", {"key": "tietCustom", "value": {"start": X("tiet_start"), "len": X("tiet_len"), "gap": 5}})
        return items
    # 1) chỉ dùng giao diện: tên danh mục tự tạo (ô nhập tối đa 30 ký tự)
    xp = page(b, "sv", init=XSS_INIT)
    xp.evaluate("catsSheet()"); xp.wait_for_timeout(300)
    xp.fill(".sheet [name=cn]", "<img data-xss=ui_cat src=x>"); xp.click(".sheet [data-addcat]"); xp.wait_for_timeout(300)
    hits = visit_all(xp)
    ok("xss: tên danh mục tự tạo không thành thẻ HTML", not hits, str(hits))
    xp.context.close()
    # 2) file sao lưu độc (đi qua mergeBackup)
    xp = page(b, "sv", init=XSS_INIT)
    xp.evaluate("j => mergeBackup(j)", {"app": "hom-nay", "version": 1, "items": evil_items()})
    hits = visit_all(xp)
    ok("xss: file sao lưu độc không chèn được thẻ HTML", not hits, str(hits))
    xp.context.close()
    # 3) ghi thẳng vào db, bỏ qua mọi bước kiểm tra lúc nhập: lớp escape khi vẽ phải tự đứng được
    xp = page(b, "sv", init=XSS_INIT)
    xp.evaluate("items => { for (const r of items) db[r.id] = { ...r, deleted: false }; rebuildCats(); render(); }", evil_items())
    hits = visit_all(xp)
    ok("xss: dữ liệu hỏng có sẵn trong máy vẫn được escape khi vẽ", not hits, str(hits))
    ok("csp: đi qua mọi màn hình không có vi phạm CSP nào", not xp.evaluate("__csp"), str(xp.evaluate("__csp"))[:300])
    xp.context.close()
    # 4) dữ liệu hỏng đã nằm trong localStorage từ trước (bản cũ, máy khác đồng bộ về): chuẩn hóa lúc nạp
    xp = page(b, "sv", init=XSS_INIT)
    xp.evaluate("items => { const d = JSON.parse(localStorage.getItem('hn-db') || '{}'); for (const r of items) d[r.id] = { ...r, deleted: false }; localStorage.setItem('hn-db', JSON.stringify(d)); }", evil_items())
    xp.reload(); xp.wait_for_timeout(400)
    clean = xp.evaluate("() => { const w = all('weight').find(r => r.data.date === '2026-10-18'); const c = all('class')[0]; return [typeof w.data.kg, c.data.start, typeof c.data.credits]; }")
    ok("xss: nạp lại thì trường số thành số, giờ sai bị bỏ", clean == ["number", "", "number"], str(clean))
    xp.context.close()
    # CSP: có thẻ meta chặn script inline; mọi kiểm thử ở trên đều chạy dưới CSP đó
    csp = b.new_page(); csp.goto(f"http://127.0.0.1:{PORT}/")
    meta = csp.locator("meta[http-equiv=Content-Security-Policy]")
    ok("csp: index.html có Content-Security-Policy chặn script inline", meta.count() == 1 and "script-src 'self'" in (meta.get_attribute("content") or ""))
    csp.close()
    # thư viện supabase-js từ cdn.jsdelivr.net vẫn được phép chạy dưới CSP
    ctx = b.new_context(); ctx.route("**/fonts.*/**", lambda r: r.abort())
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body="window.__cdnLoaded = true;"))
    cp = ctx.new_page(); cp.goto(f"http://127.0.0.1:{PORT}/"); cp.wait_for_timeout(400)
    ok("csp: vẫn tải được supabase-js từ cdn.jsdelivr.net", cp.evaluate("window.__cdnLoaded === true"))
    ctx.close()
    b.close()

# ---------- hàm hn-push (Node, Supabase giả) ----------
import subprocess
try:
    out = subprocess.run(["node", os.path.join(ROOT, "tests", "push_test.mjs")], capture_output=True, text=True, encoding="utf-8", timeout=60)
    lines = [l for l in out.stdout.splitlines() if l.startswith(("PASS ", "FAIL "))]
    for l in lines: res.append((l.startswith("PASS "), l[5:], ""))
    if out.returncode and not any(l.startswith("FAIL ") for l in lines): res.append((False, "push: node tests/push_test.mjs", (out.stderr or out.stdout)[-400:]))
except FileNotFoundError:
    res.append((False, "push: cần Node để chạy tests/push_test.mjs", ""))

fails = [r for r in res if not r[0]]
for good, name, extra in res: print(("PASS " if good else "FAIL ") + name + (f"  {extra}" if extra and not good else ""))
print(f"\n{len(res) - len(fails)}/{len(res)} passed; page errors: {errs or 'none'}")
sys.exit(1 if fails or errs else 0)
