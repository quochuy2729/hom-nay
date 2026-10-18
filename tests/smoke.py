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

    # ---------- thông báo: lỗi ràng buộc endpoint hiện bằng tiếng Việt ----------
    mp = page(b, "sv")
    msg = mp.evaluate("[pushSubError({ code: '23514', message: 'new row violates check constraint' }), pushSubError({ code: '42501', message: 'permission denied' })]")
    ok("push: endpoint lạ báo lỗi bằng tiếng Việt", msg[0].startswith("Trình duyệt này") and msg[1] == "permission denied", str(msg))
    mp.context.close()

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
    # thư viện supabase-js từ cdn.jsdelivr.net vẫn được phép tải dưới CSP
    # (file giả không khớp SRI nên không chạy; ở đây chỉ kiểm tra CSP không chặn yêu cầu, xem thêm "sri:" ở nhóm 5)
    ctx = b.new_context(); ctx.route("**/fonts.*/**", lambda r: r.abort())
    cdn_req = []
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: (cdn_req.append(r.request.url), r.fulfill(status=200, content_type="application/javascript", headers={"access-control-allow-origin": "*"}, body="window.__cdnLoaded = true;")))
    ctx.add_init_script("window.__csp = []; document.addEventListener('securitypolicyviolation', e => __csp.push(e.violatedDirective + ' ' + e.blockedURI));")
    cp = ctx.new_page(); cp.goto(f"http://127.0.0.1:{PORT}/"); cp.wait_for_timeout(400)
    ok("csp: vẫn tải được supabase-js từ cdn.jsdelivr.net", any("supabase-js@2.45.4" in u for u in cdn_req) and not cp.evaluate("__csp"), str(cp.evaluate("__csp")))
    ctx.close()
    b.close()

# ---------- nhóm 5: hiệu năng, giữ cuộn/focus, sheet là modal, ICS, không chờ CDN ----------
# Dữ liệu lớn giả lập 1–2 năm dùng: 5.000 khoản chi, 500 việc, 300 buổi tập, 300 bản đã xóa.
BIG_DATA = """() => {
  const d = JSON.parse(localStorage.getItem('hn-db') || '{}');
  const base = Date.parse('2026-10-18T06:00:00Z'); let k = 0;
  const add = (kind, data, deleted) => { const i = crypto.randomUUID(); d[i] = { id: i, kind, data, deleted: !!deleted, updated_at: new Date(base - (k++) * 1000).toISOString() }; };
  const day = off => { const t = new Date(2026, 9, 18 + off); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
  const cats = ['an', 'nuoc', 'dilai', 'muasam', 'hoc', 'giaitri'];
  for (let i = 0; i < 5000; i++) add('tx', { type: i % 15 ? 'out' : 'in', amount: 10000 + (i % 50) * 1000, cat: cats[i % 6], note: 'khoản ' + (i % 40), date: day(-Math.floor(i / 9)), at: base - i });
  for (let i = 0; i < 500; i++) add('task', { title: 'Việc ' + i, tag: 'Môn ' + (i % 10), type: ['bai', 'don', 'thi', 'khac'][i % 4], due: day((i % 120) - 60), time: i % 3 ? '' : '09:00', status: i % 5 ? 'todo' : 'done', subs: [], amount: i % 17 ? 0 : 500000 });
  for (let i = 0; i < 20; i++) add('class', { title: 'Môn ' + i, code: 'EE30' + String(i).padStart(2, '0'), days: [1 + (i % 6)], start: '07:00', end: '09:00', weeks: [], room: 'H6-30' + (i % 9) });
  for (let i = 0; i < 300; i++) add('workout', { date: day(-i), mins: 45, items: [{ ex: 'Hít xà', sets: [10, 8, 8] }], note: '' });
  for (let i = 0; i < 100; i++) add('weight', { date: day(-i * 3), kg: 60 + (i % 5) });
  for (let i = 0; i < 300; i++) add('tx', { type: 'out', amount: 1, cat: 'an', note: 'đã xóa', date: day(-i), at: 1 }, true);
  localStorage.setItem('hn-db', JSON.stringify(d));
  return Object.keys(d).length;
}"""
MEASURE = """(rounds) => {
  const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const views = { home: () => { ui.tab = 'home'; }, task: () => { ui.tab = 'task'; ui.taskFilter = 'todo'; }, 'cal-month': () => { ui.tab = 'cal'; ui.calView = 'month'; },
                  'cal-week': () => { ui.tab = 'cal'; ui.calView = 'week'; }, money: () => { ui.tab = 'money'; }, gym: () => { ui.tab = 'gym'; } };
  const out = {};
  for (const [name, set] of Object.entries(views)) {
    set(); render(); render(); document.body.offsetHeight;
    const t = []; for (let i = 0; i < rounds; i++) { const s = performance.now(); render(); document.body.offsetHeight; t.push(performance.now() - s); }
    out[name] = Math.round(med(t) * 10) / 10;
  }
  ui.tab = 'home'; render();   // tab nhẹ: đo chủ yếu chi phí ghi xuống máy
  const t = []; for (let i = 0; i < rounds; i++) { const s = performance.now(); put('tx', { type: 'out', amount: 1000, cat: 'an', note: 'đo', date: '2026-10-18', at: 1 }); t.push(performance.now() - s); }
  out.put = Math.round(med(t) * 10) / 10;
  let s = performance.now(); applyPersona('sv'); out.applyPersona = Math.round((performance.now() - s) * 10) / 10;
  return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1) Hiệu năng: không cài đồng hồ giả để performance.now() là thời gian thật
    pctx = b.new_context(viewport={"width": 393, "height": 860}, timezone_id="Asia/Ho_Chi_Minh")
    pctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); pctx.route("**/fonts.*/**", lambda r: r.abort())
    pp = pctx.new_page(); pp.on("pageerror", lambda e: errs.append(f"perf: {e}"))
    pp.goto(f"http://127.0.0.1:{PORT}/"); pp.evaluate("localStorage.setItem('hn-onboarded','1')"); pp.reload(); pp.wait_for_timeout(300)
    pp.evaluate("applyPersona('sv')"); pp.wait_for_timeout(400)
    nrec = pp.evaluate(BIG_DATA); pp.reload(); pp.wait_for_timeout(500)
    perf = pp.evaluate(MEASURE, 7)
    cdp = pctx.new_cdp_session(pp); cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    perf4 = pp.evaluate(MEASURE, 3)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    print(f"PERF {nrec} bản ghi, ms (trung vị):  {perf}")
    print(f"PERF CPU chậm 4x, ms:               {perf4}")
    ok(f"perf: render() tab Tiền {perf['money']}ms < 16ms với {nrec} bản ghi", perf["money"] < 16)
    ok(f"perf: render() Lịch tháng {perf['cal-month']}ms < 16ms", perf["cal-month"] < 16)
    ok(f"perf: render() tab Việc {perf['task']}ms < 100ms (400 việc đang mở, phần lớn là layout)", perf["task"] < 100)
    ok(f"perf: put() trên tab Hôm nay {perf['put']}ms < 16ms (ghi xuống máy để sau)", perf["put"] < 16)
    # 20 lần put liền nhau chỉ ghi localStorage một lần
    writes = pp.evaluate("""() => new Promise(res => {
      let n = 0; const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'hn-db') n++; return orig.call(this, k, v); };
      for (let i = 0; i < 20; i++) put('tx', { type: 'out', amount: 1000, cat: 'an', note: 'gộp ' + i, date: '2026-10-18', at: 1 });
      const sync = n;
      setTimeout(() => { Storage.prototype.setItem = orig; res([sync, n]); }, 800);
    })""")
    ok("persist: 20 lần put liền nhau chỉ ghi bộ nhớ 1 lần, và ghi sau đó", writes == [0, 1], str(writes))
    hidden_ok = pp.evaluate("""() => {
      const r = put('tx', { type: 'out', amount: 2000, cat: 'an', note: 'ghi khi ẩn', date: '2026-10-18', at: 1 });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
      return (localStorage.getItem('hn-db') || '').includes(r.id);
    }""")
    ok("persist: chuyển app xuống nền (visibilitychange hidden) thì ghi ngay", hidden_ok)
    rid = pp.evaluate("put('tx', { type: 'out', amount: 3000, cat: 'an', note: 'ghi rồi tải lại ngay', date: '2026-10-18', at: 1 }).id")
    pp.reload(); pp.wait_for_timeout(300)
    ok("persist: tải lại ngay sau khi ghi (pagehide) không mất dữ liệu", pp.evaluate(f"!!db['{rid}'] && all('tx').some(r => r.id === '{rid}')"))
    # Chỉ mục theo kind phải luôn khớp với db
    idx_fails = pp.evaluate("""() => {
      const fails = [], KINDS = ['task', 'class', 'tx', 'workout', 'weight', 'goal', 'doc', 'setting'];
      const brute = k => Object.keys(db).filter(id => db[id] && db[id].kind === k && !db[id].deleted).sort().join();
      const check = label => { for (const k of KINDS) if (all(k).map(r => r.id).sort().join() !== brute(k)) fails.push(label + ': ' + k); };
      const later = s => new Date(Date.now() + s * 1000).toISOString();
      check('nạp');
      const r = put('tx', { type: 'out', amount: 1000, cat: 'an', note: 'idx mới', date: '2026-10-18', at: 1 });
      if (!all('tx').some(x => x.id === r.id)) fails.push('thêm');
      put('tx', { ...r.data, note: 'idx sửa' }, r.id);
      if ((all('tx').find(x => x.id === r.id) || {}).data?.note !== 'idx sửa') fails.push('sửa');
      const snap = JSON.parse(JSON.stringify(db[r.id]));
      remove(r.id); if (all('tx').some(x => x.id === r.id)) fails.push('xóa');
      restore(snap); if (!all('tx').some(x => x.id === r.id)) fails.push('hoàn tác xóa');
      mergeRemote({ id: r.id, kind: 'goal', data: { name: 'idx', target: 1, saved: 0 }, deleted: false, updated_at: later(5) });
      if (all('tx').some(x => x.id === r.id) || !all('goal').some(x => x.id === r.id)) fails.push('đổi kind (mergeRemote)');
      mergeRemote({ id: r.id, kind: 'goal', data: {}, deleted: true, updated_at: later(9) });
      if (all('goal').some(x => x.id === r.id)) fails.push('máy khác xóa (mergeRemote)');
      const nid = crypto.randomUUID();
      mergeRemote({ id: nid, kind: 'task', data: { title: 'từ server', status: 'todo' }, deleted: false, updated_at: later(1) });
      if (!all('task').some(x => x.id === nid)) fails.push('máy khác thêm (mergeRemote)');
      const bid = crypto.randomUUID();
      mergeBackup({ app: 'hom-nay', items: [{ id: bid, kind: 'doc', data: { name: 'idx', fields: [] }, updated_at: later(1) }] });
      if (!all('doc').some(x => x.id === bid)) fails.push('khôi phục sao lưu');
      const did = crypto.randomUUID();
      db[did] = { id: did, kind: 'weight', data: { date: '2026-10-18', kg: 61 }, deleted: false, updated_at: later(1) };
      if (!all('weight').some(x => x.id === did)) fails.push('gán thẳng db[id]');
      delete db[did]; if (all('weight').some(x => x.id === did)) fails.push('delete db[id]');
      const arr = all('tx'), n = arr.length; arr.length = 0; arr.push(1); if (all('tx').length !== n) fails.push('all() để lộ mảng nội bộ');
      check('sau thao tác');
      setSetting('name', 'A'); if (getSetting('name', '') !== 'A') fails.push('setSetting');
      const sid = all('setting').find(x => x.data.key === 'name').id;
      mergeRemote({ id: sid, kind: 'setting', data: { key: 'name', value: 'B' }, deleted: false, updated_at: later(60) });
      if (getSetting('name', '') !== 'B') fails.push('getSetting sau mergeRemote');
      mergeBackup({ app: 'hom-nay', items: [{ id: crypto.randomUUID(), kind: 'setting', data: { key: 'name', value: 'C' }, updated_at: later(120) }] });
      if (getSetting('name', '') !== 'C') fails.push('getSetting sau khôi phục sao lưu');
      const tmp = crypto.randomUUID();
      db[tmp] = { id: tmp, kind: 'setting', data: { key: 'name', value: 'D' }, deleted: false, updated_at: later(180) };
      if (getSetting('name', '') !== 'D') fails.push('getSetting sau gán thẳng db[id]');
      all('setting').filter(x => x.data.key === 'name').forEach(x => remove(x.id));
      if (getSetting('name', 'mặc định') !== 'mặc định') fails.push('getSetting sau khi xóa');
      check('cuối');
      return fails;
    }""")
    ok("index: all() và getSetting luôn khớp db (thêm, sửa, xóa, đổi kind, mergeRemote, sao lưu, gán thẳng)", not idx_fails, str(idx_fails))
    # tab khác ghi localStorage: nạp lại db, chỉ mục cũng theo
    pp.wait_for_timeout(500)
    st_ok = pp.evaluate("""() => {
      const d = JSON.parse(localStorage.getItem('hn-db')); const id = crypto.randomUUID();
      d[id] = { id, kind: 'task', data: { title: 'từ tab khác', status: 'todo' }, deleted: false, updated_at: new Date().toISOString() };
      localStorage.setItem('hn-db', JSON.stringify(d));
      window.dispatchEvent(new StorageEvent('storage', { key: 'hn-db' }));
      return all('task').some(x => x.id === id);
    }""")
    ok("index: tab khác ghi bộ nhớ (sự kiện storage) thì all() thấy ngay", st_ok)
    # giữ vị trí cuộn khi vẽ lại cùng tab
    pp.evaluate("ui.tab = 'money'; render(); window.scrollTo(0, 1500)"); pp.wait_for_timeout(100)
    sy = pp.evaluate("() => { render(); put('tx', { type: 'out', amount: 1000, cat: 'an', note: 'cuộn', date: '2026-10-18', at: 1 }); return window.scrollY; }")
    ok("scroll: vẽ lại cùng tab vẫn giữ vị trí cuộn", abs(sy - 1500) <= 1, f"scrollY={sy}")
    pp.evaluate("document.querySelector('#nav [data-tab=task]').click()"); pp.wait_for_timeout(100)
    ok("scroll: đổi tab thì về đầu trang", pp.evaluate("window.scrollY") == 0)
    # tab Tiền: tháng nhiều khoản chỉ vẽ 12 ngày gần nhất, bấm Xem thêm thì hiện hết
    more = pp.evaluate("""() => { ui.tab = 'money'; ui.month = '2026-10'; render();
      const n1 = document.querySelectorAll('main [data-edit=tx]').length, btn = document.querySelector('main [data-act=money-more]');
      if (!btn) return [n1, 0, false]; btn.click();
      return [n1, document.querySelectorAll('main [data-edit=tx]').length, !document.querySelector('main [data-act=money-more]')]; }""")
    ok("money: tháng nhiều khoản có nút Xem thêm, bấm thì hiện đủ", more[0] > 0 and more[1] > more[0] and more[2], str(more))
    pctx.close()

    # 2) Giữ focus và bàn phím
    kp = page(b, "sv")
    kp.evaluate("""() => {
      put('task', { title: 'Nộp BTL Giải tích', type: 'bai', due: '2026-10-20', time: '23:59', status: 'todo', subs: [] });
      put('task', { title: 'Chờ thầy ký', type: 'don', due: '2026-10-19', time: '', status: 'waiting', waitFor: 'Thầy', subs: [] });
      put('class', { title: 'Vật lý 1', code: 'PH1003', days: [1, 2], start: '07:00', end: '09:00', weeks: [], room: 'H1-101' });
      put('tx', { type: 'out', amount: 35000, cat: 'an', note: 'cơm trưa', date: '2026-10-18', at: 1 });
    }"""); kp.wait_for_timeout(200)
    kp.click("#nav [data-tab=cal]"); kp.wait_for_timeout(150)
    kp.focus("[data-mday='2026-10-20']"); kp.keyboard.press("Enter"); kp.wait_for_timeout(150)
    ok("focus: chọn ngày bằng bàn phím, vẽ lại vẫn giữ focus ở ô ngày đó", kp.evaluate("document.activeElement && document.activeElement.dataset.mday") == "2026-10-20")
    kp.click("#nav [data-tab=task]"); kp.wait_for_timeout(150)
    kp.focus("[data-filter=waiting]"); kp.keyboard.press("Enter"); kp.wait_for_timeout(150)
    ok("focus: nút lọc Đang chờ vẫn giữ focus sau khi vẽ lại", kp.evaluate("document.activeElement && document.activeElement.dataset.filter") == "waiting")
    kp.click("#nav [data-tab=home]"); kp.wait_for_timeout(150)
    kp.click("#qIn"); kp.keyboard.type("cà phê 30k"); kp.evaluate("render()")
    ok("focus: ô ghi nhanh vẫn giữ chữ và con trỏ sau khi vẽ lại", kp.evaluate("document.activeElement.id === 'qIn' && document.activeElement.value === 'cà phê 30k' && document.activeElement.selectionStart === 10"))
    kp.fill("#qIn", ""); kp.evaluate("ui.qText = ''; document.activeElement.blur()")
    # dòng bấm được là div: phải có role=button, tabindex=0, Enter/Space mở được
    bad = kp.evaluate("""() => {
      const out = [];
      for (const t of ['home', 'task', 'cal', 'money', 'gym']) {
        ui.tab = t; render();
        document.querySelectorAll('main [data-edit], main [data-cdetail], main .tap, main [data-act]').forEach(el => {
          if (el.closest('button, a, label, input, select, textarea') === el) return;
          if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].includes(el.tagName)) return;
          if (el.getAttribute('role') !== 'button' || el.tabIndex !== 0) out.push(t + ': ' + el.outerHTML.slice(0, 60));
        });
      }
      ui.tab = 'home'; render();
      return out;
    }""")
    ok("a11y: mọi dòng bấm được (div) có role=button và tabindex=0", not bad, str(bad[:3]))
    kp.click("#nav [data-tab=cal]"); kp.wait_for_timeout(150)
    kp.click("[data-mday='2026-10-20']"); kp.wait_for_timeout(150)
    kp.focus(".ag.tap[data-edit=task]"); kp.keyboard.press("Enter"); kp.wait_for_timeout(350)
    ok("a11y: Enter trên dòng chương trình ngày (.ag) mở form", kp.locator(".sheet").count() >= 1 and kp.locator(".sheet [name=title]").count() == 1)
    kp.keyboard.press("Escape"); kp.wait_for_timeout(350)
    ok("modal: Escape đóng sheet", kp.locator(".sheet.in").count() == 0)
    ok("modal: đóng sheet thì focus trở về dòng đã mở", kp.evaluate("!!(document.activeElement && document.activeElement.matches('.ag.tap[data-edit=task]'))"))
    kp.click("#nav [data-tab=money]"); kp.wait_for_timeout(150)
    kp.focus(".row.tap[data-edit=tx]"); kp.keyboard.press(" "); kp.wait_for_timeout(350)
    ok("a11y: phím cách trên dòng khoản chi mở form sửa", kp.locator(".sheet [name=amount]").count() == 1)
    # sheet là modal: role, nhãn, Tab không ra ngoài, nền bị khóa
    info = kp.evaluate("""() => { const s = document.querySelector('.sheet'); if (!s) return [null, null, null, null, null]; const lb = s.getAttribute('aria-labelledby'); const h = lb && document.getElementById(lb);
      return [s.getAttribute('role'), s.getAttribute('aria-modal'), h ? h.textContent : null, document.querySelector('#main').inert, document.querySelector('#nav').inert]; }""")
    ok("modal: role=dialog, aria-modal=true, aria-labelledby trỏ tới tiêu đề", info[:3] == ["dialog", "true", "Sửa khoản"], str(info))
    if not kp.locator(".sheet").count(): kp.evaluate("txForm(all('tx')[0].id)"); kp.wait_for_timeout(350)
    ok("modal: nền phía sau bị khóa (inert) khi sheet mở", info[3] is True and info[4] is True, str(info))
    outside = []
    for i in range(40):
        kp.keyboard.press("Tab")
        if not kp.evaluate("!!document.activeElement.closest('.sheet')"): outside.append(i)
    for i in range(10):
        kp.keyboard.press("Shift+Tab")
        if not kp.evaluate("!!document.activeElement.closest('.sheet')"): outside.append(-i)
    ok("modal: Tab và Shift+Tab không thoát ra nền", not outside, str(outside[:5]))
    kp.evaluate("closeSheet()"); kp.wait_for_timeout(350)
    ok("modal: đóng xong thì nền dùng lại được", kp.evaluate("!document.querySelector('#main').inert && !document.querySelector('#nav').inert"))
    # công tắc: role=switch, aria-checked đổi theo
    kp.evaluate("settingsSheet()"); kp.wait_for_timeout(350)
    sw = kp.evaluate("[...document.querySelectorAll('.sheet .switch')].map(x => [x.getAttribute('role'), x.getAttribute('aria-checked'), x.classList.contains('on')])")
    ok("a11y: công tắc có role=switch và aria-checked đúng trạng thái", sw and all(r == "switch" and c == ("true" if on else "false") for r, c, on in sw), str(sw))
    kp.click(".sheet [data-big]"); kp.wait_for_timeout(100)
    ok("a11y: bấm công tắc thì aria-checked đổi theo", kp.evaluate("document.querySelector('.sheet [data-big]').getAttribute('aria-checked')") == "true")
    kp.click(".sheet [data-big]"); kp.evaluate("closeSheet()"); kp.wait_for_timeout(350)
    kp.evaluate("catsSheet()"); kp.wait_for_timeout(350)
    mini = kp.evaluate("() => { const x = document.querySelector('.sheet .switch-mini'); const a = x.getAttribute('aria-checked'); x.click(); return [x.getAttribute('role'), a, x.getAttribute('aria-checked')]; }")
    ok("a11y: công tắc ẩn/hiện danh mục có role=switch, aria-checked đổi khi bấm", mini == ["switch", "true", "false"], str(mini))
    kp.evaluate("document.querySelector('.sheet .switch-mini').click(); closeSheet()"); kp.wait_for_timeout(350)
    # mọi ô nhập trong các form đều có nhãn (label, aria-label hoặc aria-labelledby), không chỉ placeholder
    unl = kp.evaluate("""async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      const t = all('task')[0].id, c = all('class')[0].id, x = all('tx')[0].id;
      const forms = { taskForm: () => taskForm(t), taskNew: () => taskForm(null), classForm: () => classForm(c), txForm: () => txForm(x), budgetForm, catsSheet, settingsSheet,
        docForm: () => docForm(null), searchSheet, tkbSheet, workoutForm: () => workoutForm(null), weightForm: () => weightForm(null), goalForm: () => goalForm(null), icsSheet, welcomeSheet };
      for (const [name, f] of Object.entries(forms)) {
        f(); await wait(30);
        document.querySelectorAll('.sheet input, .sheet select, .sheet textarea').forEach(el => {
          if (el.type === 'hidden' || el.hidden || el.type === 'file') return;
          const named = el.labels && el.labels.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title;
          if (!named) out.push(name + ': ' + (el.name || el.outerHTML.slice(0, 50)));
        });
        if (name === 'taskForm') { document.querySelector('.sheet [data-addsub]').click(); await wait(10);
          document.querySelectorAll('.sheet [data-subs] input').forEach(el => { if (!(el.getAttribute('aria-label') || el.labels.length)) out.push('taskForm: phần việc thêm sau'); }); }
        closeSheet(); await wait(10);
      }
      return out;
    }""")
    kp.wait_for_timeout(300)
    ok("a11y: ô nhập trong form đều có nhãn", not unl, str(unl[:6]))
    # ICS: escape \\ ; , xuống dòng (RFC 5545) và gập dòng theo 75 byte UTF-8
    ics = kp.evaluate("""() => {
      put('task', { title: 'Thi cuối kỳ; Giải tích, Đại số \\\\ tuyến tính', type: 'thi', due: '2026-10-25', time: '07:30', status: 'todo', subs: [],
        note: 'Phòng H6-301; mang thẻ SV, bút chì\\nĐề gồm 4 câu: tích phân, chuỗi số, phương trình vi phân; được dùng máy tính bỏ túi. Thời gian làm bài chín mươi phút.\\nNhững điều cần nhớ: đề thi được phát lúc bảy giờ ba mươi, thí sinh đến trễ mười lăm phút sẽ không được vào phòng thi' });
      const { text } = buildIcs({ classes: false, tasks: true, until: '2026-12-31' });
      const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
      const lines = text.split('\\r\\n'); lines.pop();
      const long = lines.filter(l => enc.encode(l).length > 75);
      let broken = 0; for (const l of lines) { try { dec.decode(enc.encode(l)); } catch { broken++; } }
      const raw = enc.encode(text); let splitMid = 0;
      for (let i = 0; i + 2 < raw.length; i++) if (raw[i] === 13 && raw[i + 1] === 10 && raw[i + 2] === 32 && i > 0 && (raw[i + 3] & 0xC0) === 0x80) splitMid++;
      const un = text.replace(/\\r\\n /g, '');
      const sum = un.split('\\r\\n').find(l => l.startsWith('SUMMARY:Thi: Thi cuối kỳ'));
      const desc = un.split('\\r\\n').find(l => l.startsWith('DESCRIPTION:Phòng H6-301'));
      return { long: long.length, broken, splitMid, sum, desc, folded: /\\r\\n /.test(text) };
    }""")
    ok("ics: SUMMARY escape ; , và \\\\ đúng RFC 5545", ics["sum"] == "SUMMARY:Thi: Thi cuối kỳ\\; Giải tích\\, Đại số \\\\ tuyến tính", str(ics["sum"]))
    ok("ics: DESCRIPTION escape ; , và xuống dòng thành \\n", (ics["desc"] or "").startswith("DESCRIPTION:Phòng H6-301\\; mang thẻ SV\\, bút chì\\nĐề gồm 4 câu: tích phân\\, chuỗi số"), str(ics["desc"])[:120])
    ok("ics: mọi dòng tối đa 75 byte UTF-8, có gập dòng", ics["long"] == 0 and ics["folded"], str(ics))
    ok("ics: không cắt giữa ký tự nhiều byte", ics["broken"] == 0 and ics["splitMid"] == 0, str(ics))
    kp.context.close()

    # 3) CDN chậm: nội dung phải hiện ngay, không chờ supabase-js và Google Fonts
    held, release = [], {"on": False}
    def hold(r):
        if release["on"]: r.abort()
        else: held.append(r)
    cctx = b.new_context(viewport={"width": 393, "height": 860}, timezone_id="Asia/Ho_Chi_Minh")
    cctx.route("**/cdn.jsdelivr.net/**", hold); cctx.route("**/fonts.googleapis.com/**", hold); cctx.route("**/fonts.gstatic.com/**", hold)
    cctx.route("**/config.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body="window.HN_CONFIG = { supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'khoa-gia' };"))
    cctx.add_init_script("""window.__mainAt = null; localStorage.setItem('hn-onboarded', '1');
      new MutationObserver(() => { const m = document.getElementById('main'); if (m && m.children.length && window.__mainAt == null) window.__mainAt = performance.now(); })
        .observe(document, { subtree: true, childList: true });""")
    cpg = cctx.new_page(); cpg.on("pageerror", lambda e: errs.append(f"cdn: {e}"))
    cpg.goto(f"http://127.0.0.1:{PORT}/", wait_until="commit"); cpg.wait_for_timeout(3000)
    t_main = cpg.evaluate("window.__mainAt")
    fcp = cpg.evaluate("(performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || null")
    ok(f"cdn: CDN treo 3 giây, #main vẫn có nội dung sau {t_main and round(t_main)}ms", t_main is not None and t_main < 1500)
    ok(f"cdn: CDN treo 3 giây, lần vẽ đầu (FCP) sau {fcp and round(fcp)}ms", fcp is not None and fcp < 1500)
    ok("cdn: chưa có thư viện thì chưa báo lỗi đồng bộ", cpg.evaluate("typeof sync !== 'undefined' && sync.state !== 'error' && !sync.sb"), cpg.evaluate("typeof sync !== 'undefined' && sync.state"))
    release["on"] = True
    for r in held:
        try: r.abort()
        except Exception: pass
    cpg.wait_for_timeout(600)
    ok("cdn: thư viện tải hỏng thì khởi tạo đồng bộ báo lỗi (không treo ở trạng thái chờ)", cpg.evaluate("sync.state === 'error' && /thư viện/i.test(sync.msg)"), cpg.evaluate("sync.state + ' ' + sync.msg"))
    sri = cpg.evaluate("() => { const s = document.querySelector('script[src*=\"supabase-js@2.45.4\"]'); return s ? [s.integrity, s.crossOrigin] : null; }")
    ok("sri: script supabase-js có integrity sha384 và crossorigin", sri and sri[0].startswith("sha384-") and len(sri[0]) == 71 and sri[1] == "anonymous", str(sri))
    font = cpg.evaluate("() => { const l = document.querySelector('link[href*=\"fonts.googleapis.com/css2\"]'); return l ? [l.media, l.href.includes('display=swap')] : null; }")
    ok("cdn: Google Fonts không chặn lần vẽ đầu (media chưa áp dụng tới khi tải xong), có display=swap", font and font[0] != "all" and font[1], str(font))
    cctx.close()
    # SRI có hiệu lực: file giả trên CDN không được chạy
    sctx2 = b.new_context(); sctx2.route("**/fonts.*/**", lambda r: r.abort())
    sctx2.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", headers={"access-control-allow-origin": "*"}, body="window.__cdnLoaded = true;"))
    spg = sctx2.new_page(); spg.goto(f"http://127.0.0.1:{PORT}/"); spg.wait_for_timeout(600)
    ok("sri: file supabase-js bị tráo trên CDN thì trình duyệt không chạy", spg.evaluate("window.__cdnLoaded !== true && typeof render === 'function'"))
    sctx2.close()
    b.close()

# ---------- service worker: bản cập nhật hỏng không được làm mất app khi offline ----------
# Chạy trên bản sao repo trong thư mục tạm (config.js trống) để đổi VERSION và giả lập app.js lỗi 500 lúc cài.
import shutil, tempfile, re
SITE = os.path.join(tempfile.mkdtemp(), "site")
shutil.copytree(ROOT, SITE, ignore=shutil.ignore_patterns(".git", "tests", "supabase", "*.md", "*.sql"))
with open(os.path.join(SITE, "config.js"), "w", encoding="utf-8") as f: f.write("window.HN_CONFIG = {};\n")
FAIL = {"on": False}
class SiteH(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=SITE, **k)
    def log_message(s, *a): pass
    def do_GET(s):
        if FAIL["on"] and s.path.startswith("/app.js"): s.send_response(500); s.end_headers(); return
        return super().do_GET()
ssrv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SiteH); ssrv.handle_error = lambda *a: None; threading.Thread(target=ssrv.serve_forever, daemon=True).start()
SBASE = f"http://127.0.0.1:{ssrv.server_address[1]}/"
SWP = os.path.join(SITE, "sw.js")
def bump_sw():
    t = open(SWP, encoding="utf-8").read()
    n = int(re.search(r'"hn-v(\d+)"', t).group(1))
    open(SWP, "w", encoding="utf-8").write(t.replace(f'"hn-v{n}"', f'"hn-v{n + 1}"'))
    return f"hn-v{n + 1}", f"hn-v{n}"
def wait_sw(pg, ms=3000): pg.wait_for_timeout(ms)
with sync_playwright() as p:
    sb = p.chromium.launch(args=["--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:1, MAP fonts.gstatic.com 127.0.0.1:1, MAP cdn.jsdelivr.net 127.0.0.1:1"])
    sctx = sb.new_context(viewport={"width": 393, "height": 860})
    sp = sctx.new_page(); sp.on("pageerror", lambda e: errs.append(f"sw: {e}"))
    sp.goto(SBASE); sp.evaluate("localStorage.setItem('hn-onboarded','1')")
    sp.evaluate("navigator.serviceWorker.ready.then(() => 1)"); sp.reload(); wait_sw(sp, 1000)
    ok("sw: lần đầu cài xong, trang được service worker điều khiển", sp.evaluate("!!navigator.serviceWorker.controller"))
    sctx.set_offline(True); sp.reload(); sp.wait_for_timeout(800)
    ok("sw: offline sau lần mở đầu vẫn chạy", sp.evaluate("typeof render === 'function' && document.querySelector('#main').children.length > 0"))
    sctx.set_offline(False)
    # bản mới bị lỗi: app.js trả 500 đúng lúc cài
    new_v, old_v = bump_sw(); FAIL["on"] = True
    sp.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update()).catch(() => 0)"); wait_sw(sp)
    FAIL["on"] = False
    keys = sp.evaluate("caches.keys()")
    ok("sw: cài bản mới lỗi thì giữ nguyên cache cũ", old_v in keys, str(keys))
    sctx.set_offline(True); sp.reload(); sp.wait_for_timeout(1000)
    ok("sw: sau bản cập nhật lỗi, offline vẫn chạy", sp.evaluate("typeof render === 'function' && document.querySelector('#main').children.length > 0"))
    sctx.set_offline(False)
    # bản mới bình thường: cập nhật được, cache cũ bị dọn
    new_v2, _ = bump_sw()
    sp.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update()).catch(() => 0)"); wait_sw(sp)
    keys = sp.evaluate("caches.keys()")
    has_app = sp.evaluate(f"caches.open('{new_v2}').then(c => c.match('app.js')).then(r => !!r)")
    ok("sw: bản mới bình thường cài được, có app.js, dọn cache cũ", new_v2 in keys and old_v not in keys and has_app, str(keys))
    sctx.close(); sb.close()

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
