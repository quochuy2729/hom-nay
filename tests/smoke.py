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

    # ---------- nhóm 4: form và trải nghiệm ----------
    def in_view(pg, sel):   # phần tử nằm trọn trong màn hình (không cần cuộn)
        return pg.evaluate("""s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect();
            const h = window.visualViewport ? visualViewport.height : innerHeight; return r.height > 0 && r.top >= 0 && r.bottom <= h + 0.5; }""", sel)
    def g4_run(name, fn, *a):
        try: fn(*a)
        except Exception as e: ok(f"g4: {name} chạy hết không lỗi", False, str(e).splitlines()[0][:200])
    def g4_forms(w):
        fp = page(b, "sv", w=w); fp.set_default_timeout(3000)
        fp.evaluate("taskForm(null)"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: form việc có nút Lưu trong footer dính đáy", fp.locator(".sheet .sheet-foot [data-save]").count() == 1
           and fp.evaluate("getComputedStyle(document.querySelector('.sheet .sheet-foot')).position") == "sticky")
        ok(f"g4 {w}px: form việc mới gom trường ít dùng vào Thêm chi tiết (đang đóng)",
           fp.locator(".sheet details.more:not([open]) [name=note]").count() == 1 and fp.locator(".sheet details.more:not([open]) [name=tag]").count() == 1
           and "Thêm chi tiết" in fp.locator(".sheet details.more > summary").inner_text())
        sh = fp.evaluate("document.querySelector('.sheet details.more > summary').getBoundingClientRect().height")
        ok(f"g4 {w}px: nút Thêm chi tiết cao ít nhất 44px", sh >= 44, f"{sh}px")
        fp.click(".sheet details.more > summary"); fp.wait_for_timeout(150)
        ok(f"g4 {w}px: mở hết chi tiết vẫn thấy nút Lưu không cần cuộn", in_view(fp, ".sheet .sheet-foot [data-save]"))
        fp.set_viewport_size({"width": w, "height": 420}); fp.wait_for_timeout(200)   # bàn phím ảo chiếm nửa dưới
        fp.focus(".sheet [name=note]"); fp.wait_for_timeout(150)
        ok(f"g4 {w}px: màn hình thấp (bàn phím mở) vẫn thấy nút Lưu", in_view(fp, ".sheet .sheet-foot [data-save]"))
        fp.set_viewport_size({"width": w, "height": 860}); fp.wait_for_timeout(150)
        fp.fill(".sheet [name=title]", "Việc có ghi chú"); fp.fill(".sheet [name=note]", "ghi chú trong chi tiết")
        fp.click(".sheet [data-save]"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: lưu việc đọc được trường trong Thêm chi tiết", fp.evaluate("all('task').some(t => t.data.title === 'Việc có ghi chú' && t.data.note === 'ghi chú trong chi tiết')"))
        tid = fp.evaluate("all('task').find(t => t.data.title === 'Việc có ghi chú').id")
        fp.evaluate(f"taskForm('{tid}')"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: sửa việc đã có ghi chú thì Thêm chi tiết mở sẵn", fp.locator(".sheet details.more[open]").count() == 1)
        fp.evaluate("closeSheet()"); fp.wait_for_timeout(300)
        plain = fp.evaluate("put('task', { title: 'Việc trơn', type: 'bai', due: '2026-10-20', time: '', status: 'todo', subs: [] }).id")
        fp.evaluate(f"taskForm('{plain}')"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: sửa việc không có chi tiết thì Thêm chi tiết đóng", fp.locator(".sheet details.more:not([open])").count() == 1)
        fp.evaluate("closeSheet()"); fp.wait_for_timeout(300)
        # form chi tiêu
        fp.evaluate("txForm(null)"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: form chi tiêu có nút Lưu dính đáy, thấy ngay", fp.locator(".sheet .sheet-foot [data-save]").count() == 1 and in_view(fp, ".sheet .sheet-foot [data-save]"))
        ok(f"g4 {w}px: form chi tiêu có chip ngày (Hôm nay đang chọn), ô chọn ngày ẩn", fp.locator(".sheet [data-pick=date] button.on[data-v='0']").count() == 1
           and fp.locator(".sheet [name=date]").count() == 1 and not fp.locator(".sheet [name=date]").is_visible())
        grid = fp.evaluate("""() => { const g = document.querySelector('.sheet .catgrid'); if (!g) return null;
            const btns = [...g.querySelectorAll('button[data-v]')], gr = g.getBoundingClientRect();
            return { cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, minH: Math.min(...btns.map(x => x.getBoundingClientRect().height)),
                     fit: btns.every(x => { const r = x.getBoundingClientRect(); return r.left >= gr.left - 0.5 && r.right <= gr.right + 0.5 && x.scrollWidth <= x.clientWidth + 1; }), over: g.scrollWidth > g.clientWidth }; }""")
        ok(f"g4 {w}px: danh mục chi tiêu là lưới 4 cột, vừa khung, ô cao >= 44px", grid and grid["cols"] == 4 and grid["fit"] and not grid["over"] and grid["minH"] >= 44, str(grid))
        fp.fill(".sheet [name=amount]", "35"); fp.click(".sheet .catgrid [data-v=nuoc]"); fp.click(".sheet [data-save]"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: lưu khoản chi với danh mục chọn từ lưới", fp.evaluate("all('tx').some(r => r.data.amount === 35000 && r.data.cat === 'nuoc' && r.data.date === '2026-10-18')"))
        old = fp.evaluate("put('tx', { type: 'out', amount: 1000, cat: 'an', note: 'cũ', date: '2026-10-02', at: 1 }).id")
        fp.evaluate(f"txForm('{old}')"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: sửa khoản ngày khác hôm nay thì mở sẵn ô ngày", fp.locator(".sheet [data-pick=date] button.on[data-v=x]").count() == 1 and fp.locator(".sheet [name=date]").is_visible())
        fp.evaluate("closeSheet()"); fp.wait_for_timeout(300)
        fp.context.close()

    def g4_home_money():
        # Sắp tới hạn nhìn 7 ngày
        hp = page(b, "sv"); hp.set_default_timeout(3000)
        hp.evaluate("put('task', { title: 'Hạn 5 ngày nữa', type: 'bai', due: '2026-10-23', time: '', status: 'todo', subs: [] })")
        hp.evaluate("put('task', { title: 'Hạn 9 ngày nữa', type: 'bai', due: '2026-10-27', time: '', status: 'todo', subs: [] })")
        hp.click("#nav [data-tab=home]"); hp.wait_for_timeout(200)
        card = hp.locator("main section.card", has_text="Sắp tới hạn").inner_text()
        ok("g4: Sắp tới hạn có việc 5 ngày nữa, không có việc 9 ngày nữa", "Hạn 5 ngày nữa" in card and "Hạn 9 ngày nữa" not in card, card[:200])
        # Dự báo chi: không ngoại suy tiền nhà, hóa đơn
        hp.evaluate("""() => {
            setSetting('budget', 5000000);
            put('tx', { type: 'out', amount: 3000000, cat: 'nha', note: 'tiền nhà', date: '2026-10-05', at: 1 });
            put('tx', { type: 'out', amount: 400000, cat: 'khac', note: 'Đóng tiền mạng', date: '2026-10-06', at: 2, fromTask: 'x' });
            for (let d = 1; d <= 18; d++) put('tx', { type: 'out', amount: 50000, cat: 'an', note: 'cơm', date: '2026-10-' + String(d).padStart(2, '0'), at: 10 + d });
        }""")
        fc = hp.evaluate("(() => { try { return monthForecast('2026-10'); } catch (e) { return String(e); } })()")
        ok("g4: dự báo chỉ ngoại suy chi biến đổi (cố định 3,4tr + 50k x 31 ngày)", isinstance(fc, dict) and fc.get("fixed") == 3400000 and fc.get("proj") == 3400000 + 50000 * 31, str(fc))
        hp.click("#nav [data-tab=money]"); hp.wait_for_timeout(200)
        mt = hp.locator("main").inner_text()
        ok("g4: tiền nhà không làm dự báo báo vượt ngân sách sai", "Cứ đà này" in mt and "vượt ngân sách" not in mt.lower(), mt[:300])
        hp.context.close()

    def g4_week():
        # Lịch tuần: tối Chủ nhật mở tuần tới; Tháng → Tuần theo ngày đang chọn
        wp = page(b, "sv"); wp.set_default_timeout(3000)
        wp.evaluate("ui.calView = 'week'"); wp.click("#nav [data-tab=home]"); wp.wait_for_timeout(100)
        wp.click("#nav [data-tab=cal]"); wp.wait_for_timeout(200)
        ok("g4: Chủ nhật 13h mở tuần đang học (12/10 – 18/10)", "12/10 – 18/10" in wp.locator("main .month-nav").inner_text())
        wp.clock.set_system_time(datetime.datetime(2026, 10, 18, 19, 30, tzinfo=TZ))
        wp.click("#nav [data-tab=home]"); wp.wait_for_timeout(100); wp.click("#nav [data-tab=cal]"); wp.wait_for_timeout(200)
        ok("g4: tối Chủ nhật mở tuần tới (19/10 – 25/10)", "19/10 – 25/10" in wp.locator("main .month-nav").inner_text(), wp.locator("main .month-nav").inner_text())
        wp.click("main [data-calview=month]"); wp.wait_for_timeout(200)
        wp.click("main [data-mday='2026-10-28']"); wp.wait_for_timeout(150)
        wp.click("main [data-calview=week]"); wp.wait_for_timeout(200)
        ok("g4: chọn 28/10 ở Tháng rồi sang Tuần thì mở tuần 26/10 – 01/11, chọn T4",
           "26/10 – 01/11" in wp.locator("main .month-nav").inner_text() and wp.locator("main .days button.on").inner_text().startswith("T4"))
        wp.click("main .days [data-day='5']"); wp.wait_for_timeout(150)
        wp.click("main [data-calview=month]"); wp.wait_for_timeout(200)
        ok("g4: từ Tuần về Tháng thì chọn đúng ngày đang xem (30/10)", wp.locator("main [data-mday='2026-10-30'].sel").count() == 1)
        wp.context.close()

    def g4_onboard():
        # Lần đầu dùng: Để sau không ngầm chọn Sinh viên
        ctx = b.new_context(viewport={"width": 393, "height": 860}, timezone_id="Asia/Ho_Chi_Minh")
        ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); ctx.route("**/fonts.*/**", lambda r: r.abort())
        op = ctx.new_page(); op.on("pageerror", lambda e: errs.append(f"onboard: {e}"))
        op.clock.install(time=datetime.datetime(2026, 10, 18, 13, 5, tzinfo=TZ))
        op.goto(f"http://127.0.0.1:{PORT}/"); op.wait_for_timeout(300); op.clock.run_for(1700); op.wait_for_timeout(400)
        ok("g4: lần đầu mở có màn hình chào", op.locator(".sheet [data-later]").count() == 1)
        ok("g4: chưa chọn hồ sơ thì chưa coi là sinh viên", op.evaluate("persona()") != "sv")
        op.click(".sheet [data-later]"); op.wait_for_timeout(400)
        ok("g4: bấm Để sau thì hồ sơ trung tính, không phải sinh viên", op.evaluate("[persona(), isStudent()]") == ["other", False], str(op.evaluate("[persona(), isStudent()]")))
        ctx.close()
    def g4_persona():
        # người đi làm không thấy chữ dành cho sinh viên
        kp = page(b, "work"); kp.set_default_timeout(3000)
        kp.click("#nav [data-tab=task]"); kp.wait_for_timeout(150)
        txt = kp.locator("main").inner_text()
        kp.evaluate("taskForm(null)"); kp.wait_for_timeout(300)
        txt += kp.evaluate("document.querySelector('.sheet').innerText + [...document.querySelectorAll('.sheet [placeholder]')].map(e => e.placeholder).join(' ')")
        kp.evaluate("closeSheet()"); kp.wait_for_timeout(300)
        kp.evaluate("ui.taskFilter = 'waiting'; render()"); txt += kp.locator("main").inner_text()
        ok("g4: người đi làm không thấy 'Môn / nhóm', 'BTL', 'thầy cô'", not any(w in txt for w in ("Môn / nhóm", "BTL", "thầy cô", "Thầy")), [w for w in ("Môn / nhóm", "BTL", "thầy cô", "Thầy") if w in txt])
        # đổi hồ sơ trong Cài đặt không tự tắt Lịch học
        kp.evaluate("applyPersona('sv')"); kp.wait_for_timeout(100)
        kp.click("[data-act=settings]"); kp.wait_for_timeout(300)
        kp.click(".sheet [data-pick=persona] [data-v=work]"); kp.wait_for_timeout(400)
        ok("g4: đổi Sinh viên sang Đi làm trong Cài đặt vẫn giữ Lịch học", kp.evaluate("[persona(), mod('cal')]") == ["work", True])
        ok("g4: đổi hồ sơ thì hỏi có muốn tắt Lịch học không", "Lịch học" in kp.locator("#toast").inner_text() and kp.locator("#toast button").count() == 1, kp.locator("#toast").inner_text())
        kp.click("#toast button"); kp.wait_for_timeout(300)
        ok("g4: bấm nút trong thông báo thì mới tắt Lịch học", kp.evaluate("mod('cal')") is False)
        kp.context.close()
        # học sinh: form môn học dùng giờ phổ thông, không có chữ của Bách khoa
        sp_ = page(b, "hs"); sp_.set_default_timeout(3000)
        sp_.evaluate("classForm(null)"); sp_.wait_for_timeout(300)
        t = sp_.evaluate("document.querySelector('.sheet').innerText + [...document.querySelectorAll('.sheet [placeholder]')].map(e => e.placeholder).join(' ')")
        se = [sp_.input_value(".sheet [name=start]"), sp_.input_value(".sheet [name=end]")]
        ok("g4: học sinh thêm môn mặc định giờ phổ thông (07:00 – 09:25)", se == ["07:00", "09:25"], str(se))
        ok("g4: form môn học của học sinh không có MyBK, BKeL, H6-301", not any(w in t for w in ("MyBK", "BKeL", "H6-301", "EE3001", "Giảng viên")), [w for w in ("MyBK", "BKeL", "H6-301", "EE3001", "Giảng viên") if w in t])
        sp_.context.close()

    def g4_exam():
        # Dán lịch thi: ở lại tab Lịch, dòng bài thi không lặp tên môn
        ep = page(b, "sv"); ep.set_default_timeout(3000)
        ep.click("#nav [data-tab=cal]"); ep.wait_for_timeout(200)
        ep.evaluate("tkbSheet()"); ep.wait_for_timeout(300)
        ep.fill(".sheet [name=src]", "HỌC KỲ\tMã MH\tTên môn học\tNhóm\tLoại thi\tNgày thi\tMã phòng\tGiờ bắt đầu\tTổng số phút\n20251\tMT1003\tGiải tích 1\tL01\tCK\t2026-11-02\tH1-201\t07g00\t90\n20251\tCO1007\t\tL02\tCK\t2026-11-05\tH2-301\t09g00\t60")
        ep.wait_for_timeout(200); ep.click(".sheet [data-imp]"); ep.wait_for_timeout(500)
        ok("g4: dán lịch thi xong vẫn ở tab Lịch", ep.evaluate("ui.tab") == "cal" and ep.locator("main [data-mday]").count() > 0)
        ok("g4: lịch tháng mở tới ngày thi đầu tiên", ep.locator("main [data-mday='2026-11-02'].sel").count() == 1)
        ep.click("#nav [data-tab=task]"); ep.wait_for_timeout(200)
        row = ep.locator("main .row", has_text="Giải tích 1").first.inner_text()
        ok("g4: dòng bài thi chỉ có tên môn một lần", row.count("Giải tích 1") == 1, row)
        row2 = ep.locator("main .row", has_text="CO1007").first.inner_text()
        ok("g4: bài thi không có tên môn thì mã môn cũng chỉ hiện một lần", row2.count("CO1007") == 1, row2)
        ep.context.close()

    def g4_dash():
        # không còn gạch ngang dài (—) trong giao diện, kể cả placeholder
        dp = page(b, "sv"); dp.set_default_timeout(3000)
        dashes = dp.evaluate("""async () => {
          const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
          const scan = where => { const t = document.body.innerText + ' ' + [...document.querySelectorAll('[placeholder],[aria-label],[title]')].map(e => (e.placeholder || '') + (e.getAttribute('aria-label') || '') + (e.title || '')).join(' ');
            if (t.includes('—')) out.push(where); };
          for (const t of ['home', 'task', 'cal', 'money', 'gym']) { ui.tab = t; render(); scan(t); }
          ui.tab = 'cal'; ui.calView = 'week'; render(); scan('week');
          for (const [n, f] of [['tx', () => txForm(null)], ['budget', budgetForm], ['cats', catsSheet], ['settings', settingsSheet], ['docs', docsSheet], ['ics', icsSheet],
                                ['chooser', chooser], ['workout', () => workoutForm(null)], ['weight', () => weightForm(null)], ['goal', () => goalForm(null)],
                                ['task', () => taskForm(null)], ['class', () => classForm(null)], ['tkb', tkbSheet], ['welcome', welcomeSheet], ['search', searchSheet]]) {
            f(); await wait(30); document.querySelectorAll('.sheet details').forEach(d => d.open = true); scan(n); closeSheet(); await wait(300);
          }
          return out;
        }""")
        dp.clock.run_for(500); dp.wait_for_timeout(200)
        ok("g4: không còn ký tự — trong giao diện", not dashes, str(dashes))
        dp.context.close()
    for w in (393, 320): g4_run(f"form {w}px", g4_forms, w)
    g4_run("Sắp tới hạn, dự báo chi", g4_home_money)
    g4_run("lịch tuần", g4_week)
    g4_run("lần đầu dùng", g4_onboard)
    g4_run("chữ theo hồ sơ", g4_persona)
    g4_run("dán lịch thi", g4_exam)
    g4_run("gạch ngang dài", g4_dash)
    b.close()

# ---------- nhóm 3: màu tương phản, vùng bấm 44px, trạng thái đang chọn, lịch tháng, cỡ chữ ----------
# Đo thật trong trình duyệt bằng getComputedStyle / getBoundingClientRect. HN_CONTRAST=1 để in mọi số đo.
CR_JS = """() => {
  const P = s => {
    let m = s && s.match(/^rgba?\\(([^)]+)\\)/);
    if (m) { const a = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; }
    m = s && s.match(/^color\\(srgb ([^)]+)\\)/);
    if (m) { const a = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number); return [a[0] * 255, a[1] * 255, a[2] * 255, a.length > 3 ? a[3] : 1]; }
    return null;
  };
  const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const bgOf = el => {
    const st = [];
    for (let e = el; e; e = e.parentElement) { const c = P(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { st.push(c); if (c[3] >= 1) break; } }
    let r = [255, 255, 255, 1]; for (let i = st.length - 1; i >= 0; i--) r = over(st[i], r); return r;
  };
  const L = c => { const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = L(a), y = L(b); return Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100; };
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const one = (el, mode) => {
    const cs = getComputedStyle(el), bg = bgOf(el);
    if (mode === 'text') return ratio(over(P(cs.color), bg), bg);
    if (mode === 'bg') return ratio(bg, bgOf(el.parentElement));                       // nền phần tử so với nền chứa nó
    const b4 = getComputedStyle(el, '::before');
    if (mode === 'ring') return ratio(over(P(b4.borderTopColor), bg), bg);             // viền vòng tròn đánh dấu
    if (mode === 'fill') return ratio(over(P(b4.backgroundColor), bg), bg);            // vòng đã xong so với nền
    if (mode === 'mark') { const f = over(P(b4.backgroundColor), bg); return ratio(over(P(getComputedStyle(el, '::after').borderLeftColor), f), f); }
  };
  window.__cr = (sel, mode) => { const els = [...document.querySelectorAll(sel)].filter(vis); return els.length ? Math.min(...els.map(e => one(e, mode))) : null; };
  window.__pair = (a, b) => { const x = [...document.querySelectorAll(a)].find(vis), y = [...document.querySelectorAll(b)].find(vis); return x && y ? ratio(bgOf(x), bgOf(y)) : null; };
}"""
SEED3 = """() => {
  put('task', { title: 'Nộp BTL Giải tích', tag: 'GT1', type: 'bai', due: '2026-10-19', time: '23:59', status: 'todo', subs: [] });
  put('task', { title: 'Tiền nhà tháng 10', type: 'khac', due: '2026-10-20', status: 'todo', amount: 3500000, subs: [] });
  put('task', { title: 'Thi cuối kỳ Vật lý', type: 'thi', due: '2026-10-21', time: '07:00', status: 'todo', subs: [] });
  put('task', { title: 'Đơn phúc khảo', type: 'don', due: '2026-10-19', status: 'waiting', waitFor: 'phòng đào tạo', subs: [] });
  put('task', { title: 'Đọc chương 2', type: 'bai', due: '2026-10-18', status: 'done', subs: [] });
  put('class', { title: 'Giải tích 1', days: [0, 1, 3], start: '12:00', end: '14:00', weeks: [], room: 'H1-101' });
  put('class', { title: 'Vật lý đại cương', days: [0, 2, 4], start: '15:00', end: '17:00', weeks: [] });
  put('workout', { date: '2026-10-17', mins: 40, items: [{ ex: 'Hít đất', sets: [20, 15] }] });
}"""
VERBOSE3 = os.environ.get("HN_CONTRAST") == "1"
with sync_playwright() as p:
    b = p.chromium.launch()
    def pg3(w=393, scheme="light", force=None):
        g = page(b, "sv", w=w, scheme=scheme)
        g.evaluate(SEED3); g.evaluate(CR_JS)
        if force: g.evaluate(f"LS.set('theme', '{force}'); applyLook(); render()")
        g.clock.run_for(4000); g.wait_for_timeout(100)
        return g
    def tab(g, t): g.evaluate(f"closeSheet(); ui.tab = '{t}'; render()"); g.wait_for_timeout(50)

    # 1) tương phản WCAG AA: chữ thường >= 4.5, viền/thành phần đồ họa >= 3, ở sáng, tối theo máy và tối chọn tay
    for scheme, force in (("light", None), ("dark", None), ("light", "dark")):
        mode_name = force and f"{force} (chọn tay)" or scheme
        g = pg3(scheme=scheme, force=force)
        got = []
        def M(name, sel, mode, need, pair=None):
            v = g.evaluate("([a, b]) => __pair(a, b)", [sel, pair]) if pair else g.evaluate("([s, m]) => __cr(s, m)", [sel, mode])
            got.append((name, v)); ok(f"nhóm 3 tương phản {mode_name}: {name} >= {need}", v is not None and v >= need, f"đo được {v}")
        tab(g, "home")
        M("chip tiền (c-money)", "main .chip.c-money", "text", 4.5)
        M("chip đang học (c-gym)", "main .chip.c-gym", "text", 4.5)
        M("chip còn mấy phút (c-cls)", "main .chip.c-cls", "text", 4.5)
        M("chữ cảnh báo --warn (.amber)", "main .amber", "text", 4.5)
        M("link trên đầu thẻ", "main .card-h .link", "text", 4.5)
        M("viền vòng đánh dấu xong", "main .check:not(.on):not(.wait)", "ring", 3)
        tab(g, "task")
        M("chip việc (c-task)", "main .chip.c-task", "text", 4.5)
        M("chip thi (c-danger)", "main .chip.c-danger", "text", 4.5)
        M("chữ ô chưa chọn của .seg", "main .seg button:not(.on)", "text", 4.5)
        M("chữ ô đang chọn của .seg", "main .seg button.on", "text", 4.5)
        M("ô đang chọn của .seg so với nền .seg", "main .seg button.on", "bg", 3)
        for t in ("task", "money", "gym", "cal"):
            tab(g, t); M(f"nút + ở tab {t}", "#fab", "text", 4.5)
        tab(g, "cal")
        M("vòng đã xong so với nền thẻ", "main .check.on", "fill", 3)
        M("dấu tích trên vòng đã xong", "main .check.on", "mark", 3)
        M("số ngày hôm nay trên lịch tháng", "main .mc.today .mh b", "text", 4.5)
        M("chip thi trên lịch tháng", "main .ch.k-exam", "text", 4.5)
        g.evaluate("ui.calView = 'week'; ui.calDay = 1; render()")
        M("thứ đang chọn ở lịch tuần", "main .days button.on", "text", 4.5)
        g.evaluate("ui.calView = 'month'; render()")
        for f, name in (("txForm(null)", "chi tiêu"), ("taskForm(null)", "việc"), ("workoutForm(null)", "buổi tập"), ("classForm(null)", "môn học")):
            g.evaluate(f); g.wait_for_timeout(350)
            M(f"nút Lưu form {name}", ".sheet .btn.pri", "text", 4.5)
            if g.locator(".sheet .pills button.on").count():
                M(f"chữ pill đang chọn form {name}", ".sheet .pills button.on", "text", 4.5)
                M(f"pill đang chọn khác hẳn pill chưa chọn (form {name})", ".sheet .pills button.on", None, 3, pair=".sheet .pills button:not(.on)")
            if g.locator(".sheet .ex-pick button.on").count():
                M(f"bài tập đang chọn (form {name})", ".sheet .ex-pick button.on", "text", 4.5)
            g.evaluate("closeSheet()"); g.wait_for_timeout(300)
        g.evaluate("settingsSheet()"); g.wait_for_timeout(350)
        M("ô đang chọn .seg trong Cài đặt so với nền .seg", ".sheet .seg button.on", "bg", 3)
        g.evaluate("closeSheet()"); g.wait_for_timeout(300)
        if VERBOSE3: print(f"[tương phản {mode_name}] " + "; ".join(f"{n}: {v}" for n, v in got))
        g.context.close()

    # 2) vùng bấm >= 44px ở 320px, không cuộn ngang
    g = pg3(w=320)
    def sizes(sel):
        return g.evaluate("""s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length && getComputedStyle(e).display !== 'none')
                                 .map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 20)]; })""", sel)
    def T(name, sel):
        s = sizes(sel); small = [x for x in s if x[0] < 44 or x[1] < 44]
        ok(f"nhóm 3 vùng bấm 320px: {name} >= 44px", s and not small, f"{len(s)} phần tử, nhỏ: {small[:4]}")
    tab(g, "home")
    T(".check (đánh dấu xong)", "main .check"); T(".icon-btn", ".top .icon-btn"); T(".link", "main .link")
    ring = g.evaluate("(() => { const s = getComputedStyle(document.querySelector('main .check'), '::before'); return [s.width, s.height]; })()")
    ok("nhóm 3: vòng .check vẫn hiện tròn 24px", ring == ["24px", "24px"], str(ring))
    h1 = g.evaluate("(() => { const h = document.querySelector('.top h1'); return h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight); })()")
    ok("nhóm 3: tiêu đề trang 320px vẫn nằm trên một dòng", h1 < 1.5, f"{h1:.2f} dòng")
    tab(g, "task"); T(".seg button (Việc)", "main .seg button"); T(".check (tab Việc)", "main .check")
    tab(g, "cal"); T("mũi tên tháng", "main .mnav > button"); T(".seg button (Lịch)", "main .seg button"); T(".check (lịch tháng)", "main .check")
    g.evaluate("ui.calMonth = '2026-11'; render()"); T("nút Hôm nay khi xem tháng khác", "main .mnav .link")
    g.evaluate("ui.calMonth = null; ui.calView = 'week'; ui.calWeek = 1; render()"); T("mũi tên tuần", "main .month-nav > button"); T(".link (lịch tuần)", "main .link")
    g.evaluate("ui.calView = 'month'; ui.calWeek = 0"); tab(g, "money"); T("mũi tên tháng (Tiền)", "main .month-nav > button"); T(".link (Tiền)", "main .link")
    tab(g, "gym"); T(".link (Tập luyện)", "main .link")
    wide = []
    for persona in ("sv", "work", "hs"):
        g.evaluate(f"applyPersona('{persona}')")
        for t in ("home", "task", "cal", "money", "gym"):
            tab(g, t); sw = g.evaluate("document.documentElement.scrollWidth - innerWidth")
            if sw > 0: wide.append(f"{persona}/{t}: +{sw}px")
    ok("nhóm 3: 320px không cuộn ngang ở mọi tab", not wide, str(wide))
    g.context.close()

    # 3) trạng thái đang chọn: aria-pressed đi theo .on, kể cả khi bấm đổi trong form
    g = pg3()
    def pressed_ok(sel):
        return g.evaluate("s => { const b = [...document.querySelectorAll(s)]; return b.length > 0 && b.every(x => x.getAttribute('aria-pressed') === String(x.classList.contains('on'))); }", sel)
    tab(g, "task"); ok("nhóm 3: .seg tab Việc có aria-pressed đúng", pressed_ok("main .seg button"))
    g.click("main .seg [data-filter=done]"); g.wait_for_timeout(100)
    ok("nhóm 3: đổi bộ lọc thì aria-pressed đổi theo", pressed_ok("main .seg button") and g.get_attribute("main .seg [data-filter=done]", "aria-pressed") == "true")
    tab(g, "cal"); ok("nhóm 3: .seg Tháng/Tuần có aria-pressed đúng", pressed_ok("main .seg button"))
    g.evaluate("taskForm(null)"); g.wait_for_timeout(350)
    ok("nhóm 3: pill trong form việc có aria-pressed đúng", pressed_ok(".sheet [data-pick] button"))
    g.click(".sheet [data-pick=type] button:not(.on)"); g.wait_for_timeout(80)
    ok("nhóm 3: bấm pill khác thì aria-pressed đổi theo", pressed_ok(".sheet [data-pick] button"))
    g.evaluate("closeSheet()"); g.wait_for_timeout(300)
    g.evaluate("settingsSheet()"); g.wait_for_timeout(350)
    g.click(".sheet [data-theme] [data-v=dark]"); g.wait_for_timeout(80)
    ok("nhóm 3: .seg giao diện trong Cài đặt có aria-pressed đúng sau khi bấm", pressed_ok(".sheet .seg button") and g.get_attribute(".sheet [data-theme] [data-v=dark]", "aria-pressed") == "true")
    g.evaluate("closeSheet(); LS.set('theme', 'auto'); applyLook()"); g.wait_for_timeout(300)
    g.context.close()

    # 4) lịch tháng: tiết học lặp lại chỉ là chấm màu, chip chữ dành cho thi/hạn nộp, chữ >= 11px
    for w in (393, 320):
        g = pg3(w=w); tab(g, "cal")
        n_cls = g.locator("main .mgrid .ch.k-cls").count(); n_dot = g.locator("main .mgrid .cdots i").count()
        ok(f"nhóm 3 lịch tháng {w}px: tiết học là chấm, không phải chip chữ", n_cls == 0 and n_dot > 0, f"chip học {n_cls}, chấm {n_dot}")
        ok(f"nhóm 3 lịch tháng {w}px: thi và hạn nộp vẫn là chip chữ", g.locator("main .mgrid .ch.k-exam").count() >= 1 and g.locator("main .mgrid .ch.k-bill, main .mgrid .ch.k-task").count() >= 1)
        fs = g.evaluate("""() => Math.min(...[...document.querySelectorAll('main .mgrid *, main .legend *')].filter(e => e.getClientRects().length && getComputedStyle(e).display !== 'none'
                          && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)))""")
        ok(f"nhóm 3 lịch tháng {w}px: chữ trong lưới không nhỏ hơn 11px", fs >= 11, f"nhỏ nhất {fs}px")
        g.context.close()

    # 5) trang Hôm nay: tiêu đề thẻ không viết hoa toàn bộ, cỡ chữ gom về thang biến CSS, bớt lối thêm trùng
    for w in (393, 320):
        g = pg3(w=w); tab(g, "home")
        ok(f"nhóm 3 Hôm nay {w}px: tiêu đề thẻ không viết hoa toàn bộ", g.evaluate("[...document.querySelectorAll('main .card-h h2')].every(h => getComputedStyle(h).textTransform !== 'uppercase')"))
        scale = g.evaluate("['xs', 'sm', 'md', 'lg', 'xl', 'xxl'].map(k => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-' + k))).filter(x => x > 0)")
        used = g.evaluate("""() => [...new Set([...document.querySelectorAll('body *')].filter(e => !['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SCRIPT', 'STYLE'].includes(e.tagName)
                     && e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)))].sort((a, b) => a - b)""")
        ok(f"nhóm 3 Hôm nay {w}px: có thang cỡ chữ 5-6 biến --fs-*", 5 <= len(scale) <= 6, str(scale))
        ok(f"nhóm 3 Hôm nay {w}px: mọi chữ trên trang dùng cỡ trong thang", scale and all(x in scale for x in used), f"thang {scale}, đang dùng {used}")
        ok(f"nhóm 3 Hôm nay {w}px: bỏ hàng nút thêm trùng với ô gõ nhanh và nút +", g.locator("main .quick").count() == 0)
        g.click("#fab"); g.wait_for_timeout(350)
        ok(f"nhóm 3 Hôm nay {w}px: nút + vẫn mở bảng Thêm nhanh", g.locator(".sheet .chooser [data-c=tx]").count() == 1 and g.locator(".sheet .chooser [data-c=task]").count() == 1)
        g.context.close()
    b.close()

# ---------- nhóm 2: ghi nhanh và nhập tiền ----------
# Bảng câu mẫu nằm ở tests/quick_cases.py (parseMoney, parseQuick); phần dưới kiểm thử giao diện.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import quick_cases
with sync_playwright() as p:
    b = p.chromium.launch()
    qp = page(b, "sv"); qp.set_default_timeout(5000)
    quick_cases.run(qp, ok)
    def group2_ui(qp):
        # form chi tiêu hiểu "2tr5"
        qp.evaluate("txForm(null)"); qp.wait_for_timeout(350)
        qp.fill(".sheet [name=amount]", "2tr5")
        ok("tiền: form chi tiêu xem trước 2tr5 = 2.500.000đ", "2.500.000đ" in qp.inner_text(".sheet [data-preview]"), qp.inner_text(".sheet [data-preview]"))
        qp.click(".sheet [data-save]"); qp.wait_for_timeout(350)
        ok("tiền: form chi tiêu lưu 2tr5 thành 2.500.000đ", qp.evaluate("all('tx').some(t => t.data.amount === 2500000)"))
        # ngân sách từng loại: gõ sai thì báo, không bỏ âm thầm; mở lại không bị làm tròn
        qp.evaluate("budgetForm()"); qp.wait_for_timeout(350)
        qp.fill(".sheet [data-cb=an]", "1tr25"); qp.fill(".sheet [data-cb=nuoc]", "abc")
        qp.click(".sheet [data-save]"); qp.wait_for_timeout(200)
        ok("tiền: ngân sách từng loại gõ sai thì báo, không lưu âm thầm",
           qp.locator(".sheet [data-cb=nuoc]").count() == 1 and "Chưa hiểu" in qp.inner_text("#toast") and not (qp.evaluate("getSetting('catBudget', {})") or {}).get("an"), qp.inner_text("#toast"))
        qp.fill(".sheet [data-cb=nuoc]", ""); qp.click(".sheet [data-save]"); qp.wait_for_timeout(350)
        ok("tiền: ngân sách từng loại lưu 1tr25 = 1.250.000đ", (qp.evaluate("getSetting('catBudget', {})") or {}).get("an") == 1250000)
        qp.evaluate("budgetForm()"); qp.wait_for_timeout(350)
        ok("tiền: mở lại ngân sách không làm tròn 1.250.000đ", qp.evaluate("parseMoney(document.querySelector('.sheet [data-cb=an]').value)") == 1250000, qp.input_value(".sheet [data-cb=an]"))
        qp.evaluate("closeSheet()"); qp.wait_for_timeout(300)
        qp.evaluate("taskForm(null, { title: 'Trả góp', amount: 2450000 })"); qp.wait_for_timeout(350)
        ok("tiền: form việc hiện số tiền phải trả không làm tròn", qp.evaluate("parseMoney(document.querySelector('.sheet [name=amount]').value)") == 2450000, qp.input_value(".sheet [name=amount]"))
        qp.evaluate("closeSheet()"); qp.wait_for_timeout(300)
        qp.clock.run_for(5000); qp.wait_for_timeout(100)

        # ô ghi nhanh: đổi Chi/Thu, lưu xong vẫn ở ô nhập
        qp.click("#nav [data-tab=home]"); qp.wait_for_timeout(200)
        qp.fill("#qIn", "cafe 30k"); qp.wait_for_timeout(100)
        ok("ghi nhanh: dòng xem trước có nút đổi Chi/Thu", qp.locator("#qPrev [data-act=qflip]").count() == 1)
        qp.click("#qPrev [data-act=qflip]"); qp.wait_for_timeout(100)
        ok("ghi nhanh: bấm đổi thì thành khoản thu", "Thu 30.000đ" in qp.inner_text("#qPrev"), qp.inner_text("#qPrev"))
        qp.click("#qPrev [data-act=qsave]"); qp.wait_for_timeout(200)
        ok("ghi nhanh: lưu đúng khoản thu đã đổi", qp.evaluate("all('tx').some(t => t.data.note === 'cafe' && t.data.type === 'in' && t.data.amount === 30000 && IN_CATS.some(c => c[0] === t.data.cat))"))
        ok("ghi nhanh: lưu xong ô nhập trống và vẫn được chọn", qp.input_value("#qIn") == "" and qp.evaluate("document.activeElement && document.activeElement.id") == "qIn")
        qp.fill("#qIn", "họp 15h"); qp.press("#qIn", "Enter"); qp.wait_for_timeout(200)
        ok("ghi nhanh: Enter lưu việc chỉ có giờ vào hôm nay, vẫn ở ô nhập",
           qp.evaluate("all('task').some(t => t.data.title === 'Họp' && t.data.due === '2026-10-18' && t.data.time === '15:00')") and qp.evaluate("document.activeElement.id") == "qIn")
        # bấm vào dòng xem trước: mở form đã điền sẵn
        qp.fill("#qIn", "ăn lẩu 1 trăm rưỡi"); qp.wait_for_timeout(100)
        qp.click("#qPrev [data-act=qopen]"); qp.wait_for_timeout(400)
        ok("ghi nhanh: bấm dòng khoản chi mở form chi tiêu điền sẵn",
           qp.evaluate("parseMoney(document.querySelector('.sheet [name=amount]').value)") == 150000 and qp.input_value(".sheet [name=note]") == "ăn lẩu"
           and qp.locator(".sheet [data-pick=cat] button.on[data-v=an]").count() == 1)
        qp.click(".sheet [data-save]"); qp.wait_for_timeout(350)
        ok("ghi nhanh: lưu từ form thì có khoản và ô ghi nhanh trống", qp.evaluate("all('tx').some(t => t.data.note === 'ăn lẩu' && t.data.amount === 150000)") and qp.input_value("#qIn") == "")
        qp.fill("#qIn", "nộp BTL thứ 6 23h59"); qp.wait_for_timeout(100)
        qp.click("#qPrev [data-act=qopen]"); qp.wait_for_timeout(400)
        ok("ghi nhanh: bấm dòng việc mở form việc điền sẵn",
           qp.input_value(".sheet [name=title]") == "Nộp BTL" and qp.input_value(".sheet [name=due]") == "2026-10-23" and qp.input_value(".sheet [name=time]") == "23:59")
        qp.evaluate("closeSheet()"); qp.wait_for_timeout(300)
        qp.click("#nav [data-tab=home]"); qp.wait_for_timeout(200)
        # nhiều khoản trong một câu
        qp.fill("#qIn", "cơm 35k, cafe 20k"); qp.wait_for_timeout(100)
        ok("ghi nhanh: 'cơm 35k, cafe 20k' hiện 2 dòng", qp.locator("#qPrev [data-act=qopen]").count() == 2, qp.inner_text("#qPrev"))
        n0 = qp.evaluate("all('tx').length")
        qp.click("#qPrev [data-act=qsave]"); qp.wait_for_timeout(200)
        ok("ghi nhanh: lưu một lần được 2 khoản", qp.evaluate("all('tx').length") == n0 + 2 and qp.evaluate("all('tx').some(t => t.data.note === 'cơm' && t.data.amount === 35000)"))
        qp.click("#toast button"); qp.wait_for_timeout(200)
        ok("ghi nhanh: Hoàn tác bỏ cả 2 khoản", qp.evaluate("all('tx').length") == n0)
        qp.context.close()
        # 320px: dòng xem trước không tràn ngang, nút đủ lớn để bấm
        for scheme in ("light", "dark"):
            np = page(b, "sv", w=320, scheme=scheme)
            np.fill("#qIn", "mua laptop 12tr500 hôm qua"); np.wait_for_timeout(150)
            sizes = np.evaluate("[...document.querySelectorAll('#qPrev button')].map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })")
            ok(f"ghi nhanh 320px {scheme}: không tràn ngang", np.evaluate("document.documentElement.scrollWidth") <= 320, str(np.evaluate("document.documentElement.scrollWidth")))
            ok(f"ghi nhanh 320px {scheme}: nút trong dòng xem trước cao từ 44px", sizes and all(h >= 44 and w >= 44 for w, h in sizes), str(sizes))
            np.context.close()
    try: group2_ui(qp)
    except Exception as ex: ok("nhóm 2: kiểm thử giao diện chạy hết", False, str(ex).splitlines()[0][:200])
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
  // 2.8: sổ nợ 200 khoản của 30 người (một nửa đã trả), có hẹn trả: thẻ Sổ nợ và lịch tháng cũng nằm trong số đo
  for (let i = 0; i < 200; i++) add('debt', { who: 'Bạn ' + (i % 30), amount: 50000 + i * 1000, dir: i % 3 ? 'lend' : 'owe', date: day(-i), due: i % 4 ? '' : day(i % 40 - 10), note: 'khoản ' + i, paid: i % 2 ? 50000 + i * 1000 : 0, paidAt: i % 2 ? day(-i + 1) : '', group: '' });
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
    # 2.8: đo 3 lượt (mỗi lượt trung vị của 9 lần vẽ) rồi lấy trung vị của 3 lượt: số đo ít dao động theo máy hơn, không phải nới ngưỡng
    runs = [pp.evaluate(MEASURE, 9) for _ in range(3)]
    perf = {k: sorted(r[k] for r in runs)[1] for k in runs[0]}
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
          // dòng có nút bên trong thì role=button nằm ở phần chữ (con trực tiếp), không lồng nút trong nút
          const tgt = el.getAttribute('role') === 'button' ? el : [...el.children].find(c => c.getAttribute('role') === 'button');
          if (!tgt || tgt.tabIndex !== 0) out.push(t + ': ' + el.outerHTML.slice(0, 60));
        });
      }
      ui.tab = 'home'; render();
      return out;
    }""")
    ok("a11y: mọi dòng bấm được (div) có role=button và tabindex=0 (ở dòng hoặc phần chữ của dòng)", not bad, str(bad[:3]))
    kp.click("#nav [data-tab=cal]"); kp.wait_for_timeout(150)
    kp.click("[data-mday='2026-10-20']"); kp.wait_for_timeout(150)
    kp.focus(".ag.tap[data-edit=task][role=button], .ag.tap[data-edit=task] > [role=button]"); kp.keyboard.press("Enter"); kp.wait_for_timeout(350)
    ok("a11y: Enter trên dòng chương trình ngày (.ag) mở form", kp.locator(".sheet").count() >= 1 and kp.locator(".sheet [name=title]").count() == 1)
    kp.keyboard.press("Escape"); kp.wait_for_timeout(350)
    ok("modal: Escape đóng sheet", kp.locator(".sheet.in").count() == 0)
    ok("modal: đóng sheet thì focus trở về dòng đã mở", kp.evaluate("!!(document.activeElement && document.activeElement.closest('.ag.tap[data-edit=task]'))"))
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

# ---------- nhóm 6: việc còn dở sau 2.4.0 ----------
with sync_playwright() as p:
    b = p.chromium.launch()
    def g6():
        hp = page(b, "sv"); hp.set_default_timeout(3000)
        hp.evaluate("put('class', { title: 'Giải tích 1', days: [0], start: '15:00', end: '17:00', weeks: [] })")
        # việc hạn 5 ngày nữa: thẻ Lịch học vẫn đứng trước
        hp.evaluate("put('task', { title: 'Báo cáo tuần', type: 'bai', due: '2026-10-23', status: 'todo', subs: [] })"); hp.wait_for_timeout(100)
        order = hp.evaluate("[...document.querySelectorAll('main section.card h2')].map(h => h.textContent.trim())")
        ok("g6: không có việc gấp thì Lịch học đứng trước Sắp tới hạn", order.index("Lịch học hôm nay") < order.index("Sắp tới hạn"), str(order))
        # việc hạn ngày mai: Sắp tới hạn lên ngay dưới ô ghi nhanh
        hp.evaluate("put('task', { title: 'Nộp BTL', type: 'bai', due: '2026-10-19', time: '23:59', status: 'todo', subs: [] })"); hp.wait_for_timeout(100)
        order = hp.evaluate("[...document.querySelectorAll('main section.card h2')].map(h => h.textContent.trim())")
        ok("g6: có việc hạn hôm nay/mai thì Sắp tới hạn là thẻ đầu tiên", order and order[0] == "Sắp tới hạn", str(order))

        # ghi nhanh: mở form từ dòng xem trước rồi đóng không lưu thì giữ nguyên câu
        hp.fill("#qIn", "cơm 35k, cafe 20k"); hp.wait_for_timeout(100)
        hp.click("#qPrev [data-act=qopen][data-i='0']"); hp.wait_for_timeout(350)
        hp.click(".sheet [data-close]"); hp.wait_for_timeout(400)
        ok("g6: đóng form không lưu thì ô ghi nhanh giữ nguyên câu", hp.input_value("#qIn") == "cơm 35k, cafe 20k", hp.input_value("#qIn"))
        n0 = hp.evaluate("all('tx').length")
        hp.click("#qPrev [data-act=qopen][data-i='0']"); hp.wait_for_timeout(350)
        hp.click(".sheet [data-save]"); hp.wait_for_timeout(400)
        ok("g6: lưu từ form thì chỉ còn các khoản chưa lưu", hp.input_value("#qIn") == "cafe 20k" and hp.evaluate("all('tx').length") == n0 + 1, hp.input_value("#qIn"))
        hp.fill("#qIn", ""); hp.wait_for_timeout(100)

        # mọi form có nút Lưu nằm trong footer dính đáy
        for js, sel in (("classForm()", "[data-save]"), ("budgetForm()", "[data-save]"), ("workoutForm()", "[data-save]"), ("weightForm()", "[data-save]"),
                        ("docForm()", "[data-save]"), ("goalForm()", "[data-save]"), ("tkbSheet()", "[data-imp]")):
            hp.evaluate(js); hp.wait_for_timeout(300)
            ok(f"g6: {js} có nút Lưu trong footer dính đáy", hp.locator(f".sheet .sheet-foot {sel}").count() == 1)
            hp.evaluate("closeSheet()"); hp.wait_for_timeout(300)

        # nhập TKB: một lần vẽ lại, không vẽ lại theo từng môn
        hp.evaluate("tkbSheet()"); hp.wait_for_timeout(300)
        hp.fill(".sheet [name=src]", "HỌC KỲ\tMã MH\tTên môn học\tNhóm\tLoại thi\tNgày thi\tMã phòng\tGiờ bắt đầu\tTổng số phút\n" + "\n".join(f"20251\tMT10{i:02d}\tMôn {i}\tL01\tCK\t2026-11-{i + 1:02d}\tH1-201\t07g00\t90" for i in range(1, 9)))
        hp.wait_for_timeout(200)
        hp.evaluate("window.__rc = 0; const r0 = window.render; window.render = function () { window.__rc++; return r0.apply(this, arguments); }")
        hp.click(".sheet [data-imp]"); hp.wait_for_timeout(400)
        rc = hp.evaluate("window.__rc")
        ok("g6: nhập 8 lịch thi chỉ vẽ lại tối đa 3 lần (trước đây 10)", rc <= 3, str(rc))
        hp.context.close()

        # vùng bấm câu mẫu, công tắc tắt đủ tương phản, không lồng nút trong role=button
        for scheme in ("light", "dark"):
            sp = page(b, "sv", 320, scheme); sp.set_default_timeout(3000)
            hs = sp.evaluate("[...document.querySelectorAll('#qPrev .qex button')].map(x => x.getBoundingClientRect().height)")
            ok(f"g6 {scheme}: câu mẫu ghi nhanh cao >= 44px", hs and min(hs) >= 44, str(hs))
            sp.evaluate(CR_JS)
            sp.evaluate("settingsSheet()"); sp.wait_for_timeout(350)
            cr = sp.evaluate("""(() => { const t = [...document.querySelectorAll('.sheet .switch:not(.on) .tg, .sheet .switch-mini:not(.on) span')].filter(e => e.offsetWidth);
              return t.length ? Math.min(...t.map(e => window.__pair ? (() => { e.classList.add('__a'); e.parentElement.classList.add('__b'); const v = __pair('.__a', '.__b'); e.classList.remove('__a'); e.parentElement.classList.remove('__b'); return v; })() : 0)) : null; })()""")
            ok(f"g6 {scheme}: công tắc đang tắt tương phản với nền >= 3", cr is not None and cr >= 3, str(cr))
            sp.evaluate("closeSheet()"); sp.wait_for_timeout(300)
            sp.evaluate("put('task', { title: 'Việc A', type: 'bai', due: '2026-10-19', status: 'todo', subs: [] })"); sp.wait_for_timeout(100)
            for tab in ("home", "task", "cal", "money"):
                sp.click(f"#nav [data-tab={tab}]"); sp.wait_for_timeout(150)
                bad = sp.evaluate("[...document.querySelectorAll('[role=button]')].filter(e => e.querySelector('button, a[href], input, select, textarea, [role=switch], [role=button]')).map(e => e.className).slice(0, 5)")
                ok(f"g6 {scheme}: tab {tab} không có nút lồng trong role=button", not bad, str(bad))
            sp.context.close()

    # cỡ chữ: không viết font-size bằng px thẳng trong template của app.js
    import re as _re
    src = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()
    inl = _re.findall(r"font-size:\s*\d+(?:\.\d+)?px", src)
    ok("g6: app.js không còn font-size viết thẳng bằng px", not inl, str(inl[:5]))
    g6()
    b.close()

# ---------- Tập 2.6: lịch tuần/tháng, sheet ngày tick từng hiệp, mục tiêu cân nặng ----------
# Giáo án đọc qua hợp đồng gymDay/gymStatus/gymMatch… (kind gymplan). Giờ giả CN 18/10/2026: tuần này là 12/10 - 18/10.
GYM_PLAN_JS = """() => {
  const p = put('gymplan', { name: 'Giáo án HLV Nam', start: '2026-10-01', until: '', src: '', days: [
    { name: 'Kéo', dows: [1], date: '', rest: false, items: [
      { ex: 'Hít xà', n: 4, lo: 8, hi: 10, max: false, unit: 'lần', kg: '', side: false, note: 'chừa 1-2 lần' },
      { ex: 'Chèo tạ 1 tay', n: 3, lo: 12, hi: 0, max: false, unit: 'lần', kg: 8, side: true, note: '' } ] },
    { name: 'Đẩy', dows: [3], date: '', rest: false, items: [
      { ex: 'Xà kép', n: 4, lo: 6, hi: 10, max: false, unit: 'lần', kg: '', side: false, note: '' },
      { ex: 'Plank', n: 3, lo: 45, hi: 0, max: false, unit: 'giây', kg: '', side: false, note: '' } ] },
    { name: 'Nghỉ', dows: [4], date: '', rest: true, items: [] },
    { name: 'Chân', dows: [5, 0], date: '', rest: false, items: [
      { ex: 'Goblet squat', n: 4, lo: 12, hi: 0, max: false, unit: 'lần', kg: 8, side: false, note: 'xuống chậm 3 giây' },
      { ex: 'Hít xà', n: 3, lo: 0, hi: 0, max: true, unit: 'lần', kg: '', side: false, note: '' },
      { ex: 'Máy đung đưa', n: 1, lo: 20, hi: 0, max: false, unit: 'phút', kg: '', side: false, note: '' } ] } ] });
  return p.id;
}"""
WD = "d => all('workout').filter(w => w.data.date === d || w.data.planDate === d).map(w => w.data)"
def gset(r, h): return f'.sheet .gset[data-ga=set][data-r="{r}"][data-h="{h}"]'
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = page(b, "sv"); pg.set_default_timeout(5000)
    pid = pg.evaluate(GYM_PLAN_JS)
    pg.evaluate("put('workout', { date: '2026-10-12', mins: 40, items: [{ ex: 'Hít xà', sets: [8, 8, 7], kg: 0 }], note: '' })")
    pg.click("#nav [data-tab=gym]"); pg.wait_for_timeout(200)
    main = pg.locator("main").inner_text()
    ok("tập: không còn giáo án cứng (5 buổi, Buổi tiếp theo, cách ăn)", not any(w in main for w in ("giáo án 5 buổi", "Giáo án 5 buổi", "Buổi tiếp theo", "cách ăn")), main[:200])
    ok("tập: mặc định dạng Tuần, tiêu đề Tuần 12/10 - 18/10, 7 ngày", pg.locator("main .seg [data-v=week].on").count() == 1 and "Tuần 12/10 - 18/10" in pg.locator("main .gnav").inner_text() and pg.locator("main .gwd").count() == 7)
    ok("tập: đang ở tuần này thì không có nút Về tuần này", pg.locator("main [data-act=gym-now]").count() == 0)
    rows = pg.evaluate("Object.fromEntries([...document.querySelectorAll('main .gwd')].map(r => [r.dataset.date, r.innerText.replace(/\\s+/g, ' ')]))")
    ok("tập tuần: T2 có giáo án Kéo, đã tập 3/7 hiệp (bài ghi tay khớp theo tên)", "Kéo" in rows["2026-10-12"] and "3/7 hiệp" in rows["2026-10-12"] and "Đã tập" in rows["2026-10-12"], rows["2026-10-12"])
    ok("tập tuần: T4 chưa tập là Bỏ lỡ, T5 Nghỉ, CN có nhãn Hôm nay", "Bỏ lỡ" in rows["2026-10-14"] and "Nghỉ" in rows["2026-10-15"] and "Hôm nay" in rows["2026-10-18"] and "Không có bài" in rows["2026-10-13"], str(rows))
    pg.click("main [data-act=gym-prev]"); pg.wait_for_timeout(150)
    ok("tập tuần: ‹ về tuần trước 05/10 - 11/10, có nút Về tuần này", "Tuần 05/10 - 11/10" in pg.locator("main .gnav").inner_text() and pg.locator("main [data-act=gym-now]").count() == 1)
    pg.click("main [data-act=gym-now]"); pg.wait_for_timeout(150)
    ok("tập tuần: Về tuần này quay lại 12/10 - 18/10", "Tuần 12/10 - 18/10" in pg.locator("main .gnav").inner_text())
    pg.click("main [data-act=gym-next]"); pg.wait_for_timeout(150)
    ok("tập tuần: › sang tuần sau, ngày tương lai chưa bỏ lỡ", "Tuần 19/10 - 25/10" in pg.locator("main .gnav").inner_text() and pg.locator("main .gwd.miss").count() == 0)
    pg.click("main [data-act=gym-now]"); pg.wait_for_timeout(150)
    # dạng Tháng: nhớ qua tải lại
    pg.click("main [data-act=gym-view][data-v=month]"); pg.wait_for_timeout(150)
    ok("tập tháng: chuyển sang Tháng, lưu LS gymView", pg.evaluate("localStorage.getItem('hn-gymView')") == '"month"' and pg.locator("main .gmc").count() >= 35)
    pg.reload(); pg.wait_for_timeout(400); pg.click("#nav [data-tab=gym]"); pg.wait_for_timeout(200)
    ok("tập tháng: tải lại vẫn mở dạng Tháng", pg.locator("main .seg [data-v=month].on").count() == 1 and pg.locator("main .gmc").count() >= 35)
    cls = pg.evaluate("Object.fromEntries([...document.querySelectorAll('main .gmc')].map(c => [c.dataset.date, c.className]))")
    ok("tập tháng: 12/10 đã tập (tô màu), có số hiệp", "done" in cls["2026-10-12"] and "3/7" in pg.locator("main .gmc[data-date='2026-10-12']").inner_text(), cls["2026-10-12"])
    ok("tập tháng: 14/10 bỏ lỡ, 21/10 có bài chưa tới, 15/10 nghỉ không viền", "miss" in cls["2026-10-14"] and "plan" in cls["2026-10-21"] and not any(k in cls["2026-10-15"].split() for k in ("plan", "miss", "done")), str([cls["2026-10-14"], cls["2026-10-21"], cls["2026-10-15"]]))
    ok("tập tháng: hôm nay 18/10 có vòng, ngày ngoài tháng mờ", "today" in cls["2026-10-18"] and "out" in cls["2026-09-28"])
    ok("tập tháng: ngày trước khi có giáo án không bị tính bỏ lỡ", "miss" not in cls["2026-09-30"])
    gsum = pg.locator("main [data-gsum]").inner_text().replace("\n", " ")
    ok("tập tháng: đầu thẻ có số buổi, phút, hiệp làm / dự kiến", gsum.startswith("1 Buổi 40 Phút 3 /"), gsum)
    pg.click("main [data-act=gym-next]"); pg.wait_for_timeout(150)
    ok("tập tháng: › sang tháng 11, có nút Về tháng này", "Tháng 11, 2026" in pg.locator("main .gnav").inner_text() and pg.locator("main [data-act=gym-now]").count() == 1)
    pg.click("main [data-act=gym-prev]"); pg.wait_for_timeout(150)
    # sheet ngày mở từ lưới tháng: ngày bỏ lỡ, tập bù hôm nay
    pg.click("main .gmc[data-date='2026-10-14']"); pg.wait_for_timeout(400)
    ok("sheet ngày: mở từ lưới tháng đúng ngày, có Bỏ lỡ và nút Tập buổi này hôm nay", "14/10" in pg.locator(".sheet .sheet-h").inner_text() and pg.locator(".sheet [data-ga=today]").count() == 1)
    ok("sheet ngày: bài có liều, ghi chú người soạn; nút hiệp ghi số mục tiêu", "4 × 6-10" in pg.locator(".sheet .gex").first.inner_text() and pg.locator(gset("p0", 0)).inner_text().split("\n")[0] == "6")
    pg.click(".sheet [data-ga=today]"); pg.wait_for_timeout(150)
    pg.click(gset("p0", 0)); pg.wait_for_timeout(150)
    wd = pg.evaluate(WD, "2026-10-14")
    ok("sheet ngày: Tập buổi này hôm nay ghi workout date hôm nay, planDate 14/10", len(wd) == 1 and wd[0]["date"] == "2026-10-18" and wd[0]["planDate"] == "2026-10-14" and wd[0]["planId"] == pid and wd[0]["pname"] == "Đẩy", str(wd))
    ok("sheet ngày: tick đầu tạo item sets mảng số, hs, pi, tgt", wd and wd[0]["items"] == [{"ex": "Xà kép", "sets": [6], "kg": "", "pi": 0, "hs": [0], "tgt": "4 × 6-10", "note": ""}], str(wd and wd[0]["items"]))
    ok("sheet ngày: nút hiệp đã xong có aria-pressed, tiến độ 1/7", pg.locator(gset("p0", 0)).get_attribute("aria-pressed") == "true" and "1/7 hiệp" in pg.locator(".sheet [data-gprog]").inner_text() and "Đã tập bù vào" in pg.locator(".sheet").inner_text())
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    ok("tập tháng: buổi bù hiện made ở 14/10", "made" in pg.locator("main .gmc[data-date='2026-10-14']").get_attribute("class"))
    pg.click("main [data-act=gym-view][data-v=week]"); pg.wait_for_timeout(150)
    ok("tập tuần: 14/10 có nhãn Tập bù, CN có buổi bù", "Tập bù" in pg.locator("main .gwd[data-date='2026-10-14']").inner_text() and "bù buổi 14/10" in pg.locator("main .gwd[data-date='2026-10-18']").inner_text())
    # tick bù ngày cũ từ lưới tuần, bỏ tick hết thì xóa bản ghi
    pg.click("main .gwd[data-date='2026-10-16']"); pg.wait_for_timeout(400)
    ok("sheet ngày: mở từ lưới tuần đúng ngày 16/10", "16/10" in pg.locator(".sheet .sheet-h").inner_text())
    pg.click(gset("p0", 1)); pg.wait_for_timeout(150)
    wd = pg.evaluate(WD, "2026-10-16")
    ok("sheet ngày: tick bù quá khứ ghi vào đúng ngày, hiệp 2 có hs [1]", len(wd) == 1 and wd[0]["date"] == "2026-10-16" and wd[0]["items"][0]["sets"] == [12] and wd[0]["items"][0]["hs"] == [1] and wd[0]["items"][0]["kg"] == 8, str(wd))
    pg.click(gset("p0", 1)); pg.wait_for_timeout(150)
    ok("sheet ngày: bỏ hết tick thì bản ghi bị xóa", pg.evaluate(WD, "2026-10-16") == [] and pg.locator(gset("p0", 1)).get_attribute("aria-pressed") == "false")
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    # ngày tương lai: xem được, không tick được
    pg.click("main [data-act=gym-next]"); pg.wait_for_timeout(150)
    pg.click("main .gwd[data-date='2026-10-21']"); pg.wait_for_timeout(400)
    pg.click(gset("p0", 0), force=True); pg.wait_for_timeout(150)   # aria-disabled: Playwright coi là tắt, bấm thẳng
    ok("sheet ngày: ngày tương lai xem được bài, chạm hiệp không ghi gì", pg.locator(".sheet .gex").count() == 2 and pg.evaluate(WD, "2026-10-21") == [] and pg.locator(gset("p0", 0)).get_attribute("aria-disabled") == "true" and pg.locator(".sheet [data-ga=add]").count() == 0)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300); pg.clock.run_for(3000)
    pg.click("main [data-act=gym-now]"); pg.wait_for_timeout(150)
    # thẻ Hôm nay tập ở tab Tập mở sheet hôm nay
    pg.click("main .gtoday"); pg.wait_for_timeout(400)
    ok("sheet ngày: thẻ Hôm nay tập mở sheet hôm nay, 3 bài", "18/10" in pg.locator(".sheet .sheet-h").inner_text() and pg.locator(".sheet .gex").count() == 3)
    hs_ = pg.evaluate("[...document.querySelectorAll('.sheet .gset')].map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; })")
    ok("sheet ngày: nút hiệp và + Thêm hiệp >= 44px", hs_ and min(min(x) for x in hs_) >= 44, str(hs_[:4]))
    pg.click(".sheet [data-rest] button[data-s='60']"); pg.wait_for_timeout(100)
    pg.click(".sheet [data-reststop]"); pg.wait_for_timeout(100)
    pg.click(gset("p0", 0)); pg.click(gset("p0", 1)); pg.wait_for_timeout(150)
    ok("sheet ngày: đã chọn mức nghỉ thì tick xong đồng hồ tự chạy", pg.locator(".sheet [data-restbox]").is_visible() and pg.evaluate("localStorage.getItem('hn-gymRest')") == "60")
    pg.click(".sheet [data-rest] button[data-s='60']"); pg.wait_for_timeout(100)   # chạm lại mức đang chọn: tắt
    gw = "() => all('workout').find(w => w.data.planDate === '2026-10-18' && w.data.date === '2026-10-18')"
    it0 = pg.evaluate(f"({gw})().data.items.find(i => i.pi === 0)")
    ok("sheet ngày: tick 2 hiệp Goblet squat ghi [12, 12], hs [0, 1], kg giáo án", it0["sets"] == [12, 12] and it0["hs"] == [0, 1] and it0["kg"] == 8, str(it0))
    pg.click(gset("p0", 0)); pg.wait_for_timeout(150)
    it0 = pg.evaluate(f"({gw})().data.items.find(i => i.pi === 0)")
    ok("sheet ngày: chạm lại hiệp đã xong là bỏ tick, còn hiệp 2", it0["sets"] == [12] and it0["hs"] == [1], str(it0))
    # mục tiêu tối đa: chạm là hỏi số ngay trong sheet
    pg.click(gset("p1", 0)); pg.wait_for_timeout(150)
    ok("sheet ngày: bài tối đa chạm là mở ô nhập số trong sheet (không mở sheet khác)", pg.locator(".sheet [data-num]").count() == 1 and pg.locator(".sheet").count() == 1 and "18/10" in pg.locator(".sheet .sheet-h").inner_text())
    pg.fill(".sheet [data-num]", "7"); pg.press(".sheet [data-num]", "Enter"); pg.wait_for_timeout(150)
    it1 = pg.evaluate(f"({gw})().data.items.find(i => i.pi === 1)")
    ok("sheet ngày: nhập 7 rồi Enter thì ghi hiệp 1 = 7", it1["sets"] == [7] and it1["hs"] == [0] and pg.locator(".sheet [data-num]").count() == 0, str(it1))
    # giữ lâu: sửa số
    bx = pg.locator(gset("p0", 1)).bounding_box()
    pg.mouse.move(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2); pg.mouse.down(); pg.clock.run_for(700); pg.wait_for_timeout(100); pg.mouse.up(); pg.wait_for_timeout(150)
    ok("sheet ngày: giữ lâu nút hiệp mở ô sửa số, không bỏ tick", pg.locator(".sheet [data-num]").count() == 1 and pg.evaluate(f"({gw})().data.items.find(i => i.pi === 0).sets") == [12])
    pg.fill(".sheet [data-num]", "15"); pg.click(".sheet [data-ga=numok]"); pg.wait_for_timeout(150)
    it0 = pg.evaluate(f"({gw})().data.items.find(i => i.pi === 0)")
    ok("sheet ngày: sửa số hiệp 2 thành 15", it0["sets"] == [15] and it0["hs"] == [1], str(it0))
    pg.click('.sheet [data-ga=add][data-r="p0"]'); pg.wait_for_timeout(150)
    it0 = pg.evaluate(f"({gw})().data.items.find(i => i.pi === 0)")
    ok("sheet ngày: + Thêm hiệp tạo hiệp đã tick, giá trị hiệp trước", it0["sets"] == [15, 15] and it0["hs"] == [1, 4] and pg.locator(gset("p0", 4)).get_attribute("aria-pressed") == "true", str(it0))
    ok("sheet ngày: tiến độ 3/8 (hiệp thêm không tính vượt mục tiêu)", "3/8 hiệp" in pg.locator(".sheet [data-gprog]").inner_text(), pg.locator(".sheet [data-gprog]").inner_text())
    # nút Sửa số (bàn phím): chọn hiệp rồi bỏ tick trong ô sửa
    pg.click('.sheet [data-ga=pick][data-r="p0"]'); pg.wait_for_timeout(100)
    pg.focus(gset("p0", 1)); pg.keyboard.press("Enter"); pg.wait_for_timeout(150)
    ok("sheet ngày: Sửa số rồi chọn hiệp bằng bàn phím mở ô sửa", pg.locator(".sheet [data-num]").count() == 1 and pg.input_value(".sheet [data-num]") == "15")
    pg.click(".sheet [data-ga=numdel]"); pg.wait_for_timeout(150)
    ok("sheet ngày: Bỏ tick hiệp này trong ô sửa", pg.evaluate(f"({gw})().data.items.find(i => i.pi === 0).hs") == [4])
    # ghi chú bài, + Thêm bài ngoài giáo án
    pg.fill('.sheet [data-exnote][data-r="p0"]', "Gối hơi đau"); pg.press('.sheet [data-exnote][data-r="p0"]', "Enter"); pg.wait_for_timeout(150)
    ok("sheet ngày: ghi chú bài lưu vào items[].note", pg.evaluate(f"({gw})().data.items.find(i => i.pi === 0).note") == "Gối hơi đau")
    pg.click(".sheet [data-ga=addex]"); pg.wait_for_timeout(100)
    pg.fill(".sheet [data-addname]", "chống đẩy"); pg.fill(".sheet [data-addnum]", "15"); pg.click(".sheet [data-ga=addok]"); pg.wait_for_timeout(150)
    ex = pg.evaluate(f"({gw})().data.items.filter(i => !Number.isInteger(i.pi))")
    ok("sheet ngày: + Thêm bài ngoài giáo án (tên chuẩn hóa theo danh sách bài)", ex == [{"ex": "Chống đẩy", "sets": [15], "hs": [0], "kg": "", "note": ""}], str(ex))
    xr = pg.evaluate("document.querySelector('.sheet .gex [data-ga=add][data-r^=x]').dataset.r")
    pg.click(f'.sheet [data-ga=add][data-r="{xr}"]'); pg.wait_for_timeout(150)
    ok("sheet ngày: + Thêm hiệp ở bài thêm", pg.evaluate(f"({gw})().data.items.find(i => i.ex === 'Chống đẩy').sets") == [15, 15])
    pg.fill(".sheet [data-snote]", "Hôm nay khỏe"); pg.press(".sheet [data-mins]", "Tab"); pg.fill(".sheet [data-mins]", "50"); pg.press(".sheet [data-mins]", "Enter"); pg.wait_for_timeout(150)
    w18 = pg.evaluate(f"({gw})().data")
    ok("sheet ngày: ghi chú buổi và số phút lưu vào workout", w18["note"] == "Hôm nay khỏe" and w18["mins"] == 50, str([w18["note"], w18["mins"]]))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    hist = pg.locator("main .list .row", has_text="Goblet squat").first.inner_text()
    ok("lịch sử: hiện tên buổi và ghi chú bài", "Chân" in hist and "Goblet squat: Gối hơi đau" in hist, hist)
    # workoutForm giữ note, pi, hs; đổi số hiệp thì đánh lại hs
    wid = pg.evaluate(f"({gw})().id")
    pg.evaluate(f"workoutForm('{wid}')"); pg.wait_for_timeout(400)
    ok("form buổi tập: có ô Ghi chú bài mang giá trị cũ", pg.locator(".sheet .ex-note").first.input_value() == "Gối hơi đau")
    pg.fill(".sheet [name=mins]", "55"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(300)
    d = pg.evaluate(f"db['{wid}'].data")
    g0 = [i for i in d["items"] if i.get("pi") == 0][0]
    ok("form buổi tập: lưu lại giữ pi, hs, tgt, note và planDate", d["mins"] == 55 and d["planDate"] == "2026-10-18" and g0["hs"] == [4] and g0["note"] == "Gối hơi đau" and g0["tgt"] == "4 × 12 · 8kg", str(g0))
    pg.evaluate(f"workoutForm('{wid}')"); pg.wait_for_timeout(400)
    pg.locator(".sheet .ex-row").first.locator("[data-sets]").fill("12 12 12"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(300)
    g0 = [i for i in pg.evaluate(f"db['{wid}'].data.items") if i.get("pi") == 0][0]
    ok("form buổi tập: đổi số hiệp thì hs = 0..n-1", g0["sets"] == [12, 12, 12] and g0["hs"] == [0, 1, 2], str(g0))
    pg.evaluate(f"workoutForm('{wid}')"); pg.wait_for_timeout(400)
    pg.locator(".sheet .ex-row").first.locator("[data-sets]").fill(""); pg.click(".sheet [data-save]"); pg.wait_for_timeout(300)
    g0 = [i for i in pg.evaluate(f"db['{wid}'].data.items") if i.get("pi") == 0]
    ok("form buổi tập: bài chỉ còn ghi chú vẫn được giữ", len(g0) == 1 and g0[0]["sets"] == [] and g0[0]["note"] == "Gối hơi đau", str(g0))
    pg.clock.run_for(3000)
    # thẻ Tập ở Hôm nay mở sheet ngày; tick() vẽ lại tab Tập khi sang ngày mới
    pg.click("#nav [data-tab=home]"); pg.wait_for_timeout(150)
    ok("hôm nay: thẻ Tập có dòng buổi hôm nay, không còn Buổi tiếp theo", "Hôm nay: Chân" in pg.locator("main [data-hometoday]").inner_text() and "Buổi tiếp theo" not in pg.locator("main").inner_text())
    pg.click("main [data-hometoday]"); pg.wait_for_timeout(400)
    ok("hôm nay: chạm thẻ Tập mở sheet ngày hôm nay", pg.locator(".sheet .gex").count() >= 3 and "18/10" in pg.locator(".sheet .sheet-h").inner_text())
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    pg.click("main [data-tab=gym]"); pg.wait_for_timeout(150)
    ok("hôm nay: nút số buổi trong thẻ Tập chuyển sang tab Tập", pg.evaluate("ui.tab") == "gym")
    rc = pg.evaluate("() => { let n = 0; const r0 = window.render; window.render = function () { n++; return r0.apply(this, arguments); }; lastDay = '2026-10-17'; tick(); window.render = r0; return n; }")
    ok("tập: tick() vẽ lại tab Tập (sang ngày mới)", rc >= 1, str(rc))
    # cân nặng: mục tiêu và xu hướng (giữ từ 2.5.0)
    pg.evaluate("put('weight', { date: '2026-09-27', kg: 80 }); put('weight', { date: '2026-10-04', kg: 79.5 }); put('weight', { date: '2026-10-11', kg: 79 })")
    pg.click("main [data-act=weight]"); pg.wait_for_timeout(400)
    pg.fill(".sheet [name=kg]", "78,6"); pg.fill(".sheet [name=goal]", "70")
    pg.click(".sheet [data-save]"); pg.wait_for_timeout(400); pg.clock.run_for(4000)
    ok("cân nặng: lưu mục tiêu 70 kg", pg.evaluate("getSetting('weightGoal', 0)") == 70)
    wg = pg.locator("main [data-wgoal]").inner_text() if pg.locator("main [data-wgoal]").count() else ""
    ok("cân nặng: có xu hướng kg/tuần, còn bao nhiêu kg, dự kiến tháng đạt", "kg/tuần" in wg and "còn 8,6 kg" in wg and "theo đà này" in wg, wg)
    ok("cân nặng: đà giảm khoảng 0,5 kg/tuần", -0.6 < pg.evaluate("weightTrend(all('weight').sort((a, b) => a.data.date.localeCompare(b.data.date)))") < -0.4)
    pg.click("main [data-act=weight]"); pg.wait_for_timeout(400)
    pg.fill(".sheet [name=goal]", "5"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(300)
    ok("cân nặng: mục tiêu sai thì báo, không lưu", pg.evaluate("getSetting('weightGoal', 0)") == 70 and pg.locator(".sheet [name=goal]").count() == 1)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    # dữ liệu lạ không thành HTML (luật NORM của bản 2.5.0 vẫn giữ)
    ok("giáo án cũ: plan lạ bị chuẩn hóa thành rỗng", pg.evaluate("normalize('workout', { plan: '<img src=x>' }).plan") == "")
    ok("giáo án cũ: gymPlan lạ bị chuẩn hóa", pg.evaluate("JSON.stringify(normalize('setting', { key: 'gymPlan', value: { on: 'yes', start: '<b>' } }).value)") == '{"on":false,"start":""}')
    ok("tập: không có gạch ngang dài", "—" not in pg.locator("main").inner_text())
    pg.context.close()

    # ghi nhanh "hít xà 3x10" nối vào workout đầu tiên của ngày và khớp đúng bài trong sheet ngày
    pg = page(b, "sv"); pg.set_default_timeout(5000)
    pid = pg.evaluate(GYM_PLAN_JS)
    pg.fill("#qIn", "hít xà 3x10"); pg.press("#qIn", "Enter"); pg.wait_for_timeout(200)
    ok("ghi nhanh: hít xà 3x10 tạo workout hôm nay", pg.evaluate("all('workout').map(w => [w.data.date, w.data.items.map(i => [i.ex, i.sets])])") == [["2026-10-18", [["Hít xà", [10, 10, 10]]]]])
    pg.evaluate("gymDaySheet('2026-10-18')"); pg.wait_for_timeout(400)
    on = pg.evaluate("[...document.querySelectorAll('.sheet .gset[data-ga=set][data-r=p1]')].map(e => [e.getAttribute('aria-pressed'), e.querySelector('b').textContent])")
    ok("ghi nhanh: sheet ngày hiện 3 hiệp Hít xà đã xong (10 10 10), không thành bài thêm", on == [["true", "10"]] * 3 and pg.locator(".sheet .gex").count() == 3 and "3/8 hiệp" in pg.locator(".sheet [data-gprog]").inner_text(), str(on))
    pg.click(gset("p0", 0)); pg.wait_for_timeout(150)
    ws_ = pg.evaluate("all('workout').map(w => w.data)")
    ok("ghi nhanh: tick tiếp ghi vào cùng workout, gắn planDate và pi cho bài ghi nhanh", len(ws_) == 1 and ws_[0]["planDate"] == "2026-10-18" and ws_[0]["planId"] == pid and ws_[0]["items"][0]["pi"] == 1 and ws_[0]["items"][1]["pi"] == 0, str(ws_))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    pg.fill("#qIn", "chống đẩy 2x20"); pg.press("#qIn", "Enter"); pg.wait_for_timeout(200)
    pg.evaluate("gymDaySheet('2026-10-18')"); pg.wait_for_timeout(400)
    ok("ghi nhanh: bài không có trong giáo án hiện ở phần bài thêm", "Bài thêm ngoài giáo án" in pg.locator(".sheet").inner_text() and pg.locator(".sheet .gex").count() == 4 and len(pg.evaluate("all('workout')")) == 1)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    pg.context.close()

    # ghi nhanh sau khi đã tập bù hôm nay cho ngày khác: phải vào buổi của chính hôm nay, không nối vào buổi bù
    pg = page(b, "sv"); pg.set_default_timeout(5000)
    pid = pg.evaluate(GYM_PLAN_JS)
    pg.evaluate("gymDaySheet('2026-10-14')"); pg.wait_for_timeout(400)
    pg.click(".sheet [data-ga=today]"); pg.wait_for_timeout(150); pg.click(gset("p0", 0)); pg.wait_for_timeout(150)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    pg.click("#nav [data-tab=home]"); pg.wait_for_timeout(150)
    pg.fill("#qIn", "hít xà 3x10"); pg.press("#qIn", "Enter"); pg.wait_for_timeout(200); pg.clock.run_for(4000)
    ws_ = pg.evaluate("all('workout').map(w => [w.data.date, w.data.planDate || '', w.data.items.map(i => i.ex)]).sort()")
    ok("ghi nhanh sau buổi bù: tạo buổi riêng cho hôm nay, buổi bù 14/10 giữ nguyên", ws_ == [["2026-10-18", "", ["Hít xà"]], ["2026-10-18", "2026-10-14", ["Xà kép"]]], str(ws_))
    pg.evaluate("gymDaySheet('2026-10-18')"); pg.wait_for_timeout(400)
    on = pg.evaluate("[...document.querySelectorAll('.sheet .gset[data-ga=set][data-r=p1]')].map(e => e.getAttribute('aria-pressed'))")
    ok("ghi nhanh sau buổi bù: sheet hôm nay khớp Hít xà 3 hiệp, tiến độ 3/8", on == ["true"] * 3 and "3/8 hiệp" in pg.locator(".sheet [data-gprog]").inner_text(), str(on))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    ok("ghi nhanh sau buổi bù: thẻ Hôm nay ghi 3/8 hiệp", "Chân · 3/8 hiệp" in pg.locator("main [data-hometoday]").inner_text(), pg.locator("main [data-hometoday]").inner_text())
    # xuất: một buổi tập bù chỉ tính cho ngày được bù, không tính thêm cho ngày nó được tập (16/10 tập bù cho 14/10)
    pg.evaluate(f"put('workout', {{ date: '2026-10-16', planId: '{pid}', planDate: '2026-10-12', pname: 'Kéo', mins: '', note: '', items: [{{ ex: 'Hít xà', sets: [8], kg: '', pi: 0, hs: [0] }}] }})")
    xs = pg.evaluate("gpExport('4w').text")
    ok("xuất: buổi tập bù không bị đếm hai lần (12/10 bù, 14/10 bù, 16/10 chưa tập, hôm nay đã tập)", "Đã tập 3/10 buổi theo giáo án" in xs, xs[-200:])
    pg.context.close()

    # dữ liệu cũ 2.5.0 nạp thẳng từ localStorage như bản 2.5.0 để lại, rồi dán giáo án đè lên các ngày đó
    T0 = "2026-10-10T05:00:00.000Z"
    W1, W2, W3 = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"
    OLD = {W1: {"id": W1, "kind": "workout", "deleted": False, "updated_at": T0, "data": {"date": "2026-10-13", "plan": "A", "mins": 45, "items": [{"ex": "Hít xà", "sets": [5, 4, 4], "kg": 0}, {"ex": "Bulgarian split squat", "sets": [10, 10, 9], "kg": 8}], "note": "ổn"}},
           W2: {"id": W2, "kind": "workout", "deleted": False, "updated_at": T0, "data": {"date": "2026-10-06", "plan": "B", "mins": 40, "items": [{"ex": "Hít xà", "sets": [6, 5, 5], "kg": 0}, {"ex": "Plank", "sets": [45, 40], "kg": 0}], "note": ""}},
           W3: {"id": W3, "kind": "workout", "deleted": False, "updated_at": T0, "data": {"date": "2026-10-16", "plan": "D", "mins": 30, "items": [{"ex": "Hít xà", "sets": [7, 6], "kg": 0}], "note": ""}},
           "s1": {"id": "s1", "kind": "setting", "deleted": False, "updated_at": T0, "data": {"key": "gymPlan", "value": {"on": True, "start": "2026-10-05"}}},
           "k1": {"id": "k1", "kind": "weight", "deleted": False, "updated_at": T0, "data": {"date": "2026-10-11", "kg": 79}}}
    import json as _json
    pg = page(b, "sv", init="if (!sessionStorage.getItem('old25')) { sessionStorage.setItem('old25', '1'); localStorage.setItem('hn-db', " + _json.dumps(_json.dumps(OLD)) + "); }"); pg.set_default_timeout(5000)
    pg.click("#nav [data-tab=gym]"); pg.wait_for_timeout(200)
    ok("dữ liệu 2.5.0 từ máy: nạp đủ 3 buổi, plan A/B/D và gymPlan còn nguyên", pg.evaluate(f"[db['{W1}'].data.plan, db['{W2}'].data.plan, db['{W3}'].data.plan, JSON.stringify(getSetting('gymPlan'))].join()") == 'A,B,D,{"on":true,"start":"2026-10-05"}')
    pr = pg.evaluate("[...document.querySelectorAll('main .cat-row')].map(r => r.innerText.replace(/\\s+/g, ' '))")
    r13 = pg.locator("main .gwd[data-date='2026-10-13']").inner_text().replace("\n", " ")
    ok("dữ liệu 2.5.0 từ máy: kỷ lục Hít xà 7, tóm tắt buổi đúng, lịch sử 3 buổi", pr and pr[0].startswith("Hít xà 7") and "Hít xà 13 lần · Bulgarian split squat 29 lần" in r13 and pg.locator("main .list .row[data-edit=workout]").count() == 3, str(pr) + r13)
    w2b = pg.evaluate(f"db['{W2}'].data")
    pg.evaluate(f"workoutForm('{W2}')"); pg.wait_for_timeout(400); pg.click(".sheet [data-save]"); pg.wait_for_timeout(300)
    ok("dữ liệu 2.5.0 từ máy: lưu lại bằng form không đổi dữ liệu", pg.evaluate(f"db['{W2}'].data") == w2b, str(pg.evaluate(f"db['{W2}'].data")))
    pg.clock.run_for(3000)
    pg.click("main [data-act=gp-paste]"); pg.wait_for_timeout(400)
    pg.fill(".sheet [name=gpsrc]", "Thứ 3: Hít xà 4x8, Bulgarian split squat 3x10 8kg\nThứ 6: Hít xà 3xmax")
    pg.click(".sheet [data-gpst='2026-10-12']"); pg.wait_for_timeout(100); pg.click(".sheet [data-gpmode=fix]"); pg.wait_for_timeout(100); pg.click(".sheet [data-gpsave]"); pg.wait_for_timeout(300); pg.clock.run_for(5000)
    r16 = pg.locator("main .gwd[data-date='2026-10-16']").inner_text().replace("\n", " ")
    ok("dữ liệu 2.5.0 + giáo án mới: buổi cũ khớp theo tên (13/10 6/7, 16/10 2/3)", "6/7 hiệp" in pg.locator("main .gwd[data-date='2026-10-13']").inner_text() and "2/3 hiệp" in r16 and "Đã tập" in r16, r16)
    pg.click("main .gwd[data-date='2026-10-16']"); pg.wait_for_timeout(400)
    pg.click(gset("p0", 2)); pg.wait_for_timeout(150); pg.fill(".sheet [data-num]", "5"); pg.press(".sheet [data-num]", "Enter"); pg.wait_for_timeout(150)
    d3 = pg.evaluate(f"db['{W3}'].data")
    ok("dữ liệu 2.5.0 + giáo án mới: tick thêm vào buổi cũ giữ hiệp cũ và plan D", d3["items"][0]["sets"] == [7, 6, 5] and d3["items"][0]["hs"] == [0, 1, 2] and d3["plan"] == "D" and d3["mins"] == 30, str(d3))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(500)
    ok("dữ liệu 2.5.0: tải lại vẫn còn plan A/B/D và gymPlan", pg.evaluate(f"[db['{W1}'].data.plan, db['{W2}'].data.plan, db['{W3}'].data.plan, getSetting('gymPlan').start].join()") == "A,B,D,2026-10-05")
    pg.context.close()

    # dữ liệu cũ 2.5.0: workout plan "A", setting gymPlan; chưa có giáo án mới
    pg = page(b, "sv"); pg.set_default_timeout(5000)
    pg.evaluate("""() => { setSetting('gymPlan', { on: true, start: '2026-10-01' });
      put('workout', { date: '2026-10-13', plan: 'A', mins: 45, items: [{ ex: 'Hít xà', sets: [5, 4, 4], kg: 0 }, { ex: 'Bulgarian split squat', sets: [10, 10, 9], kg: 8 }], note: '' }); }""")
    pg.click("#nav [data-tab=gym]"); pg.wait_for_timeout(200)
    r13 = pg.locator("main .gwd[data-date='2026-10-13']").inner_text().replace("\n", " ")
    ok("dữ liệu 2.5.0: buổi plan A vẫn hiện, tính đã tập", "Đã tập" in r13 and "Hít xà 13" in r13 and pg.locator("main .gwd.miss").count() == 0, r13)
    ok("dữ liệu 2.5.0: tiêu đề tab đếm buổi tuần này, không còn giáo án cũ", "1 buổi tuần này" in pg.locator("main .top").inner_text() and "Giáo án 5 buổi" not in pg.locator("main").inner_text())
    pg.click("main .gwd[data-date='2026-10-13']"); pg.wait_for_timeout(400)
    ok("dữ liệu 2.5.0: sheet ngày không có giáo án vẫn mở, hiện bài đã tập", pg.locator(".sheet .gex").count() == 2 and "Ngày này không có bài" in pg.locator(".sheet").inner_text())
    pg.click(gset("x1", 2)); pg.wait_for_timeout(150)
    ok("dữ liệu 2.5.0: bỏ tick một hiệp ở buổi cũ, giữ nguyên plan A", pg.evaluate("all('workout')[0].data.items[1].sets") == [10, 10] and pg.evaluate("all('workout')[0].data.plan") == "A")
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    pg.click("#nav [data-tab=home]"); pg.wait_for_timeout(150)
    ok("dữ liệu 2.5.0: trang Hôm nay không còn Buổi tiếp theo", "Buổi tiếp theo" not in pg.locator("main").inner_text())
    pg.context.close()

    # XSS: giáo án, tên bài, ghi chú, tên buổi độc ở lưới, sheet ngày, lịch sử
    XI = """window.__xss = [];
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        [n, ...n.querySelectorAll('[data-xss]')].forEach(e => { const t = e.getAttribute('data-xss'); if (t && !__xss.includes(t)) __xss.push(t); });
      }))).observe(document, { subtree: true, childList: true });"""
    Y = lambda tag: f"\"'><img data-xss={tag} src=x>"
    xp = page(b, "sv", init=XI); xp.set_default_timeout(5000)
    evil = {"plan": {"name": Y("gp_name"), "start": "2026-10-01", "until": "", "days": [
                {"name": Y("gp_day"), "dows": [0, 1, 2, 3, 4, 5, 6], "date": "", "rest": False, "items": [
                    {"ex": Y("gp_ex"), "n": 2, "lo": 8, "hi": 0, "max": False, "unit": "lần", "kg": "", "side": False, "note": Y("gp_note")}]}]},
            "w": {"date": "2026-10-17", "mins": Y("w_mins"), "pname": Y("w_pname"), "planDate": "2026-10-17", "note": Y("w_note"),
                  "items": [{"ex": Y("gp_ex"), "sets": [Y("w_set"), 5], "pi": 0, "hs": [0, 1], "kg": Y("w_kg"), "tgt": Y("w_tgt"), "note": Y("w_exnote")},
                            {"ex": Y("w_ex2"), "sets": [Y("w_set2")], "kg": "", "tgt": Y("w_tgt2"), "note": Y("w_exnote2")}]}}
    xp.evaluate("""e => { const id1 = crypto.randomUUID(), id2 = crypto.randomUUID(), t = '2026-10-18T05:00:00.000Z';
      db[id1] = { id: id1, kind: 'gymplan', data: e.plan, deleted: false, updated_at: t };
      db[id2] = { id: id2, kind: 'workout', data: { ...e.w, planId: id1 }, deleted: false, updated_at: t }; render(); }""", evil)
    shown = xp.evaluate("""async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      ui.tab = 'gym'; for (const v of ['week', 'month']) { ui.gymView = v; render(); }
      ui.tab = 'home'; render();
      for (const d of ['2026-10-17', '2026-10-18', '2026-10-21']) { gymDaySheet(d); await wait(30); closeSheet(); await wait(10); }
      gymDaySheet('2026-10-17'); await wait(30);
      const shown = ['gp_ex', 'gp_note', 'w_set', 'gp_name', 'w_tgt2', 'gp_day'].filter(t => document.querySelector('.sheet').innerText.includes('data-xss=' + t));
      document.querySelector('.sheet [data-ga=addex]').click(); await wait(10);
      document.querySelector('.sheet .gset[data-ga=set]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(10);
      closeSheet(); await wait(10);
      all('workout').forEach(r => { workoutForm(r.id); closeSheet(); });
      ui.tab = 'gym'; ui.gymView = 'week'; render();
      return [shown, document.querySelector('main').innerText.includes('data-xss=w_exnote')];
    }""")
    xp.clock.run_for(500); xp.wait_for_timeout(200)
    hits = xp.evaluate("__xss")
    ok("xss: giáo án, buổi tập độc ở lưới tuần/tháng, sheet ngày, lịch sử không thành thẻ HTML", not hits, str(hits))
    ok("xss: chữ độc hiện thành chữ thường trong sheet ngày và lịch sử (kiểm thử thật sự đã vẽ)", len(shown[0]) == 6 and shown[1], str(shown))
    xp.context.close()

    # 320px sáng và tối: không tràn ngang ở Tuần, Tháng, sheet ngày; vùng bấm lưới >= 44px
    for scheme in ("light", "dark"):
        sp = page(b, "sv", w=320, scheme=scheme); sp.set_default_timeout(5000)
        sp.evaluate(GYM_PLAN_JS); sp.evaluate("put('workout', { date: '2026-10-12', mins: 40, items: [{ ex: 'Hít xà', sets: [8, 8, 7], kg: 0, note: 'một ghi chú khá dài cho bài này để thử xuống dòng' }], note: '' })")
        sp.click("#nav [data-tab=gym]"); sp.wait_for_timeout(200)
        wide = []
        for v in ("week", "month"):
            sp.click(f"main [data-act=gym-view][data-v={v}]"); sp.wait_for_timeout(150)
            if sp.evaluate("document.documentElement.scrollWidth") > 320: wide.append(v)
            hh = sp.evaluate("[...document.querySelectorAll('main .gwd, main .gmc, main .gnav > button, main .seg button')].map(e => e.getBoundingClientRect().height)")
            ok(f"tập 320px {scheme}: vùng bấm dạng {v} cao >= 44px", hh and min(hh) >= 44, str(min(hh) if hh else hh))
        sp.evaluate("gymDaySheet('2026-10-18')"); sp.wait_for_timeout(400)
        sp.click(gset("p1", 0)); sp.wait_for_timeout(150)
        if sp.evaluate("Math.max(document.documentElement.scrollWidth, document.querySelector('.sheet').scrollWidth)") > 320: wide.append("sheet")
        ok(f"tập 320px {scheme}: không tràn ngang (Tuần, Tháng, sheet ngày có ô sửa số)", not wide, str(wide))
        ok(f"tập 320px {scheme}: sheet ngày không có gạch ngang dài", "—" not in sp.locator(".sheet").inner_text())
        rh = sp.evaluate("[...document.querySelectorAll('.sheet [data-rest] button')].map(e => e.getBoundingClientRect().height)")
        ok(f"tập 320px {scheme}: nút mức nghỉ trong sheet ngày cao >= 44px", rh and min(rh) >= 44, str(rh))
        sp.evaluate("closeSheet()"); sp.wait_for_timeout(300)
        # ngày nghỉ trong Quản lý: không dính kiểu .rest của đồng hồ nghỉ (chữ to, nền xanh), không lặp "Nghỉ Nghỉ"
        sp.click("main [data-act=gp-manage]"); sp.wait_for_timeout(400)
        fz = sp.evaluate("[...document.querySelectorAll('.sheet .gp-day')].map(d => [d.classList.contains('gp-rest'), getComputedStyle(d.querySelector('.gp-dh b')).fontSize, getComputedStyle(d).display, d.querySelector('.gp-dh').innerText.replace(/\\s+/g, ' ')])")
        rest_ = [x for x in fz if x[0]]; norm_ = [x for x in fz if not x[0]]
        ok(f"tập 320px {scheme}: ngày nghỉ trong Quản lý cùng cỡ chữ với buổi khác, không lặp chữ Nghỉ", len(rest_) == 1 and rest_[0][1] == norm_[0][1] and rest_[0][2] == norm_[0][2] and "Nghỉ Nghỉ" not in rest_[0][3] and sp.locator(".sheet .gp-day.rest").count() == 0, str(fz))
        sp.context.close()
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

# ---------- luồng 1: thao tác nhanh trên việc, dời ngày trên lịch, tìm kiếm, lối tắt và chia sẻ ----------
# Giờ giả: Chủ nhật 18/10/2026 13:05. Ghi nhanh câu mới nằm trong tests/quick_cases.py (khối "luồng 1").
with sync_playwright() as p:
    b = p.chromium.launch()
    L1_SEED = """() => batch(() => {
      put('task', { title: 'Nộp BTL', tag: 'Giải tích 1', type: 'bai', due: '2026-10-15', time: '23:59', status: 'todo', subs: [] });
      put('task', { title: 'Nộp đơn', type: 'don', due: '2026-10-16', status: 'todo', subs: [] });
      put('task', { title: 'Họp nhóm', type: 'bai', due: '2026-10-20', status: 'todo', subs: [] });
      put('task', { title: 'Đã nộp xong', type: 'bai', due: '2026-10-17', status: 'done', doneAt: 1, subs: [] });
      put('tx', { type: 'out', amount: 35000, cat: 'an', note: 'cơm trưa', date: '2026-10-23', at: 1 });
    })"""
    tid = lambda pg, title: pg.evaluate("t => all('task').find(r => r.data.title === t).id", title)
    due = lambda pg, title: pg.evaluate("t => all('task').find(r => r.data.title === t).data.due", title)
    def l1():
        lp = page(b, "sv"); lp.set_default_timeout(3000)
        lp.evaluate(L1_SEED); lp.wait_for_timeout(100)
        lp.click("#nav [data-tab=task]"); lp.wait_for_timeout(150)
        n_more = lp.locator("main [data-act=task-more]").count()
        ok("l1: dòng việc chưa xong có nút ⋯, việc đã xong thì không", n_more == 3, str(n_more))
        hs = lp.evaluate("[...document.querySelectorAll('main [data-act=task-more]')].map(x => { const r = x.getBoundingClientRect(); return Math.min(r.width, r.height); })")
        ok("l1: nút ⋯ có vùng bấm >= 44px", hs and min(hs) >= 44, str(hs))
        # nút ⋯ mở thao tác nhanh, không mở form sửa
        lp.click(f"main [data-act=task-more][data-id='{tid(lp, 'Nộp BTL')}']"); lp.wait_for_timeout(350)
        ok("l1: bấm ⋯ mở sheet thao tác nhanh có tên việc", lp.locator(".sheet [data-ta=due]").count() >= 3 and lp.locator(".sheet h3").inner_text() == "Nộp BTL" and lp.locator(".sheet [name=title]").count() == 0)
        targets = lp.evaluate("[...document.querySelectorAll('.sheet [data-ta=due]')].map(b => [b.querySelector('b').textContent, b.dataset.d])")
        ok("l1: Chủ nhật: dời sang Hôm nay 18/10, Ngày mai 19/10, Cuối tuần là thứ 7 24/10 (bỏ Tuần sau vì trùng Ngày mai)",
           targets == [["Hôm nay", "2026-10-18"], ["Ngày mai", "2026-10-19"], ["Cuối tuần", "2026-10-24"]], str(targets))
        lp.click(".sheet [data-ta=due][data-d='2026-10-19']"); lp.wait_for_timeout(350)
        ok("l1: dời sang mai: đổi hạn, giữ giờ, đóng sheet", due(lp, "Nộp BTL") == "2026-10-19" and lp.evaluate("all('task').find(r => r.data.title === 'Nộp BTL').data.time") == "23:59" and lp.locator(".sheet.in").count() == 0)
        ok("l1: báo đã dời kèm Hoàn tác", "Đã dời sang ngày mai" in lp.locator("#toast").inner_text() and lp.locator("#toast button").inner_text() == "Hoàn tác", lp.locator("#toast").inner_text())
        lp.click("#toast button"); lp.wait_for_timeout(150)
        ok("l1: Hoàn tác trả lại hạn cũ", due(lp, "Nộp BTL") == "2026-10-15")
        lp.clock.run_for(5000); lp.wait_for_timeout(150)
        # giữ lâu một dòng: mở thao tác nhanh; nhấc tay ra không đóng sheet, không mở form sửa
        row = lp.locator(f"main .row[data-id='{tid(lp, 'Nộp đơn')}'] .t").first
        bb = row.bounding_box()
        lp.mouse.move(bb["x"] + 10, bb["y"] + 5); lp.mouse.down(); lp.clock.run_for(600); lp.wait_for_timeout(100); lp.mouse.up(); lp.wait_for_timeout(350)
        ok("l1: giữ lâu dòng việc mở thao tác nhanh, nhấc tay ra sheet vẫn mở", lp.locator(".sheet.in [data-ta=due]").count() >= 1 and lp.locator(".sheet h3").inner_text() == "Nộp đơn" and lp.locator(".sheet [name=title]").count() == 0)
        lp.evaluate("closeSheet()"); lp.wait_for_timeout(350)
        lp.mouse.move(bb["x"] + 10, bb["y"] + 5); lp.mouse.down(); lp.clock.run_for(200); lp.mouse.up(); lp.wait_for_timeout(350)
        ok("l1: chạm nhanh vẫn mở form sửa như cũ", lp.locator(".sheet [name=title]").count() == 1 and lp.input_value(".sheet [name=title]") == "Nộp đơn")
        lp.evaluate("closeSheet()"); lp.wait_for_timeout(350)
        lp.click(f"main .row[data-id='{tid(lp, 'Họp nhóm')}'] .t", button="right"); lp.wait_for_timeout(350)
        ok("l1: chuột phải trên dòng việc mở thao tác nhanh", lp.locator(".sheet [data-ta=pick]").count() == 1 and lp.locator(".sheet h3").inner_text() == "Họp nhóm")
        # chọn ngày trên lịch: sang tab Lịch dạng Tháng, bấm ô là dời
        lp.click(".sheet [data-ta=pick]"); lp.wait_for_timeout(400)
        ok("l1: Chọn trên lịch mở Lịch tháng có thanh hướng dẫn và đánh dấu ngày cũ",
           lp.evaluate("ui.tab") == "cal" and lp.locator("main .movebar").count() == 1 and "Họp nhóm" in lp.locator("main .movebar").inner_text() and lp.locator("main .mc.from[data-mday='2026-10-20']").count() == 1)
        lp.click("main [data-mmonth='1']"); lp.wait_for_timeout(150)
        ok("l1: đổi tháng vẫn đang chọn ngày để dời", lp.locator("main .movebar").count() == 1)
        lp.click("main [data-mday='2026-11-05']"); lp.wait_for_timeout(200)
        ok("l1: bấm ô 05/11 thì việc dời sang 05/11, thoát chế độ dời", due(lp, "Họp nhóm") == "2026-11-05" and lp.locator("main .movebar").count() == 0 and lp.evaluate("ui.moveId") is None)
        ok("l1: ô vừa bấm thành ngày đang chọn, chương trình ngày có việc vừa dời", lp.locator("main .mc.sel[data-mday='2026-11-05']").count() == 1 and "Họp nhóm" in lp.locator("main section.card").last.inner_text())
        lp.click("#toast button"); lp.wait_for_timeout(150)
        ok("l1: Hoàn tác dời trên lịch", due(lp, "Họp nhóm") == "2026-10-20")
        lp.clock.run_for(5000); lp.wait_for_timeout(150)
        # thoát chế độ dời: nút Hủy, phím Escape, đổi tab
        lp.evaluate(f"startMovePick('{tid(lp, 'Họp nhóm')}')"); lp.wait_for_timeout(150)
        lp.click("main [data-act=move-cancel]"); lp.wait_for_timeout(150)
        ok("l1: Hủy thì thoát chế độ dời, bấm ô chỉ chọn ngày", lp.locator("main .movebar").count() == 0)
        lp.click("main [data-mday='2026-10-28']"); lp.wait_for_timeout(150)
        ok("l1: sau khi Hủy, bấm ô không dời việc", due(lp, "Họp nhóm") == "2026-10-20")
        lp.evaluate(f"startMovePick('{tid(lp, 'Họp nhóm')}')"); lp.wait_for_timeout(150)
        lp.keyboard.press("Escape"); lp.wait_for_timeout(150)
        ok("l1: Escape thoát chế độ dời", lp.locator("main .movebar").count() == 0 and lp.evaluate("ui.moveId") is None)
        lp.evaluate(f"startMovePick('{tid(lp, 'Họp nhóm')}')"); lp.wait_for_timeout(150)
        lp.click("#nav [data-tab=home]"); lp.click("#nav [data-tab=cal]"); lp.wait_for_timeout(150)
        ok("l1: đổi tab thì thoát chế độ dời", lp.locator("main .movebar").count() == 0)
        # giữ lâu dòng chương trình ngày (.ag) trên lịch cũng mở thao tác nhanh
        lp.click("main [data-mday='2026-10-20']"); lp.wait_for_timeout(150)
        lp.click("main .ag[data-edit=task] .t", button="right"); lp.wait_for_timeout(350)
        ok("l1: chuột phải trên dòng chương trình ngày mở thao tác nhanh", lp.locator(".sheet [data-ta=pick]").count() == 1)
        lp.evaluate("closeSheet()"); lp.wait_for_timeout(350)
        # dời hết việc quá hạn
        lp.click("#nav [data-tab=home]"); lp.wait_for_timeout(150)
        ok("l1: Hôm nay có 2 việc quá hạn thì có nút Dời hết sang hôm nay", lp.locator("main .ovd [data-act=move-overdue]").count() == 1 and "2 việc quá hạn" in lp.locator("main .ovd").inner_text())
        lp.click("#nav [data-tab=task]"); lp.wait_for_timeout(150)
        # "; 0" ở cuối: evaluate trả về hàm thì Playwright gọi luôn hàm đó, tính thừa một lần vẽ
        lp.evaluate("window.__rc = 0; const r0 = window.render; window.render = function () { window.__rc++; return r0.apply(this, arguments); }; 0")
        lp.click("main .group-h [data-act=move-overdue]"); lp.wait_for_timeout(200)
        rc = lp.evaluate("window.__rc")
        ok("l1: Dời hết sang hôm nay: mọi việc quá hạn có hạn 18/10, chỉ vẽ lại một lần", due(lp, "Nộp BTL") == "2026-10-18" and due(lp, "Nộp đơn") == "2026-10-18" and rc == 1, str(rc))
        ok("l1: việc đã xong không bị dời", due(lp, "Đã nộp xong") == "2026-10-17")
        ok("l1: không còn nhóm Quá hạn", "Quá hạn" not in lp.locator("main").inner_text())
        lp.click("#toast button"); lp.wait_for_timeout(150)
        ok("l1: Hoàn tác trả lại hạn cũ cho cả nhóm", due(lp, "Nộp BTL") == "2026-10-15" and due(lp, "Nộp đơn") == "2026-10-16")
        lp.clock.run_for(5000); lp.wait_for_timeout(150)
        lp.evaluate(f"put('task', {{ ...db['{tid(lp, 'Nộp đơn')}'].data, due: '2026-10-25' }}, '{tid(lp, 'Nộp đơn')}')"); lp.click("#nav [data-tab=home]"); lp.wait_for_timeout(150)
        ok("l1: chỉ 1 việc quá hạn thì không hiện dòng dời hết (đã có nút ⋯ trên dòng)", lp.locator("main .ovd").count() == 0)
        # tìm kiếm: nhiều từ, theo ngày, theo số tiền, tô sáng chữ có dấu
        lp.evaluate("searchSheet()"); lp.wait_for_timeout(350)
        def sq(q):
            lp.fill(".sheet [name=q]", q); lp.wait_for_timeout(120)
            return lp.evaluate("[...document.querySelectorAll('.sheet [data-res] .row .t')].map(e => e.textContent)")
        ok("l1: tìm 'btl giai' (hai từ ở hai trường: tên và môn) ra việc Nộp BTL", sq("btl giai") == ["Nộp BTL"], str(sq("btl giai")))
        ok("l1: tìm 'giai btl' (đảo thứ tự) vẫn ra", sq("giai btl") == ["Nộp BTL"])
        marks = lp.evaluate("[...document.querySelectorAll('.sheet [data-res] mark')].map(m => m.textContent)")
        ok("l1: kết quả tô sáng đúng chữ có dấu", "BTL" in marks and "Giải" in marks, str(marks))
        ok("l1: tìm '20/10' ra việc hạn 20/10", "Họp nhóm" in sq("20/10"))
        ok("l1: tìm '23/10' ra khoản chi ngày 23/10", "cơm trưa" in sq("23/10"))
        ok("l1: tìm '35k' ra khoản 35.000đ", "cơm trưa" in sq("35k"))
        ok("l1: từ không khớp thì không ra gì", sq("btl xyz") == [] and "Không tìm thấy" in lp.locator(".sheet [data-res]").inner_text())
        lp.evaluate("closeSheet()"); lp.wait_for_timeout(350)
        hl = lp.evaluate("[hl('Giải tích <b>', ['giai']), hl('ĐƠN đăng ký', ['don', 'dang']), hl('a&b', []), hl('Nộp', ['zz'])]")
        ok("l1: hl() escape và bọc đúng phần khớp", hl == ["<mark>Giải</mark> tích &lt;b&gt;", "<mark>ĐƠN</mark> <mark>đăng</mark> ký", "a&amp;b", "Nộp"], str(hl))
        lp.context.close()

        # Hôm nay chưa có việc nào: chỉ cách ghi bằng một câu, bấm là điền vào ô ghi nhanh
        ep = page(b, "sv"); ep.set_default_timeout(3000)
        btn = ep.locator("main section.card", has_text="Sắp tới hạn").locator("[data-act=qfill]")
        ok("l1: chưa có việc nào thì thẻ Sắp tới hạn có câu mẫu bấm được", btn.count() == 1)
        if btn.count(): btn.click(); ep.wait_for_timeout(150)
        ok("l1: bấm câu mẫu thì ô ghi nhanh có câu và xem trước hiểu được", ep.input_value("#qIn") == "nộp BTL thứ 6 23h59" and "Việc: Nộp BTL" in ep.locator("#qPrev").inner_text(), ep.locator("#qPrev").inner_text())
        ep.context.close()

        # XSS: tên việc độc trong sheet thao tác nhanh, thanh dời ngày, kết quả tìm kiếm có tô sáng
        xp = page(b, "sv", init=XSS_INIT); xp.set_default_timeout(3000)
        xp.evaluate("t => { const r = put('task', { title: t, tag: t, type: 'bai', due: '2026-10-15', status: 'todo', subs: [] }); taskActions(r.id); }", X("l1_actions"))
        xp.wait_for_timeout(300); xp.evaluate("closeSheet()"); xp.wait_for_timeout(300)
        xp.evaluate("startMovePick(all('task')[0].id)"); xp.wait_for_timeout(150)
        xp.evaluate("ui.moveId = null; searchSheet()"); xp.wait_for_timeout(300)
        for q in ("img", "xss", "l1"):
            xp.fill(".sheet [name=q]", q); xp.wait_for_timeout(100)
        xp.clock.run_for(500); xp.wait_for_timeout(150)
        ok("l1 xss: thao tác nhanh, thanh dời ngày, tô sáng tìm kiếm không chèn được thẻ", not xp.evaluate("__xss"), str(xp.evaluate("__xss")))
        xp.context.close()

        # lối tắt trên icon và chia sẻ chữ từ app khác (manifest)
        man = json.load(open(os.path.join(ROOT, "manifest.webmanifest"), encoding="utf-8"))
        urls = [s["url"] for s in man.get("shortcuts", [])]
        ok("l1: manifest có lối tắt Ghi nhanh, Thêm việc, Ghi chi, Lịch (mỗi lối có tên ngắn và icon)", urls == ["./?add=quick", "./?add=task", "./?add=tx", "./?tab=cal"] and all(s.get("short_name") and s.get("icons") for s in man["shortcuts"]), str(urls))
        st = man.get("share_target") or {}
        ok("l1: manifest có share_target GET đọc share_text", st.get("method") == "GET" and st.get("action") == "./" and st.get("params", {}).get("text") == "share_text", str(st))
        icons = [i["src"] for s in man["shortcuts"] for i in s["icons"]]
        ok("l1: icon của lối tắt có thật và nằm trong SHELL của sw.js", all(os.path.exists(os.path.join(ROOT, i)) and f'"{i}"' in open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read() for i in icons), str(icons))
        sp = page(b, "sv"); sp.set_default_timeout(3000)
        base = f"http://127.0.0.1:{PORT}/"
        sp.goto(base + "?add=quick"); sp.wait_for_timeout(500)
        ok("l1: ?add=quick mở Hôm nay, con trỏ ở ô ghi nhanh, bỏ tham số khỏi địa chỉ", sp.evaluate("ui.tab") == "home" and sp.evaluate("document.activeElement && document.activeElement.id") == "qIn" and "?" not in sp.url, sp.url)
        sp.goto(base + "?tab=cal"); sp.wait_for_timeout(500)
        ok("l1: ?tab=cal mở tab Lịch", sp.evaluate("ui.tab") == "cal" and sp.locator("#nav [data-tab=cal].on").count() == 1)
        sp.goto(base + "?share_title=Nh%C3%B3m&share_text=" + "n%E1%BB%99p%20BTL%20th%E1%BB%A9%206%2023h59%20https%3A%2F%2Fexample.com%2Fx"); sp.wait_for_timeout(500)
        ok("l1: chia sẻ chữ vào app thì điền ô ghi nhanh (bỏ đường link) và hiện xem trước", sp.evaluate("ui.tab") == "home" and sp.input_value("#qIn") == "Nhóm nộp BTL thứ 6 23h59" and "Việc:" in sp.locator("#qPrev").inner_text(), sp.input_value("#qIn"))
        ok("l1: chia sẻ xong chưa tự lưu gì", sp.evaluate("all('task').length") == 0)
        sp.context.close()
    l1()
# ---------- luồng 2: tiền, ngân sách, mục tiêu, ghi nhanh, dọn bản đã xóa ----------
# Giờ giả lập như mọi khối khác: Chủ nhật 18/10/2026 13:05 (tuần 12/10 tới 18/10, tháng còn 14 ngày kể cả hôm nay).
with sync_playwright() as p:
    b = p.chromium.launch()
    def l2():
        lp = page(b, "sv"); lp.set_default_timeout(3000)
        # 1) ngân sách còn mỗi ngày trừ khoản sắp phải trả; dự báo cộng khoản đó
        lp.evaluate("""() => batch(() => {
            setSetting('budget', 3000000);
            put('tx', { type: 'out', amount: 1000000, cat: 'an', note: 'đi chợ', date: '2026-10-02', at: Date.parse('2026-10-02T05:00:00Z') });
            put('task', { title: 'Tiền điện', type: 'khac', due: '2026-10-25', status: 'todo', amount: 500000, cat: 'nha', subs: [] });
            put('task', { title: 'Học phí kỳ sau', type: 'khac', due: '2026-12-01', status: 'todo', amount: 9000000, cat: 'hoc', subs: [] });
        })""")
        bl = lp.evaluate("budgetLeft()")
        ok("l2: ngân sách còn lại trừ khoản phải trả trong tháng (bỏ khoản tháng sau)", bl["bills"] == 500000 and bl["left"] == 1500000 and bl["daysLeft"] == 14 and round(bl["perDay"]) == round(1500000 / 14), str(bl))
        line = lp.inner_text("main .spendline")
        ok("l2: thẻ Chi tiêu trên Hôm nay báo còn mỗi ngày, đã trừ khoản sắp trả", "/ngày" in line and "đã trừ 500k sắp trả" in line, line)
        lp.click("#nav [data-tab=money]"); lp.wait_for_timeout(150)
        top = lp.inner_text("main section.card >> nth=0")
        ok("l2: tab Tiền: mỗi ngày còn bao nhiêu sau khi trừ khoản sắp phải trả", "sau khi trừ 500k sắp phải trả" in top, top)
        fc = lp.evaluate("monthForecast('2026-10')")
        ok("l2: dự báo cả tháng cộng khoản sắp phải trả", fc["bills"] == 500000 and fc["proj"] == round(1000000 / 18 * 31) + 500000, str(fc))
        ok("l2: dòng dự báo ghi rõ đã gồm khoản sắp phải trả", "đã gồm 500k sắp phải trả" in top, top)
        # ghi tay khoản trùng tên và số tiền (quên đánh dấu xong) thì không trừ hai lần
        lp.evaluate("put('tx', { type: 'out', amount: 500000, cat: 'nha', note: 'tiền điện', date: '2026-10-18', at: Date.now() })")
        ok("l2: khoản phải trả đã ghi chi tay thì không trừ thêm", lp.evaluate("budgetLeft().bills") == 0)
        lp.evaluate("setSetting('budget', 1600000)"); lp.click("#nav [data-tab=home]"); lp.wait_for_timeout(100)
        lp.evaluate("put('task', { title: 'Tiền mạng', type: 'khac', due: '2026-10-28', status: 'todo', amount: 300000, cat: 'hoadon', subs: [] })")
        line = lp.inner_text("main .spendline")
        ok("l2: khoản sắp trả làm vượt ngân sách thì báo trước", "sẽ làm vượt ngân sách" in line, line)
        lp.evaluate("batch(() => { all('task').filter(t => t.data.amount > 0).forEach(t => remove(t.id)); setSetting('budget', sumOut(monthTx('2026-10'))); })")
        line = lp.inner_text("main .spendline")
        ok("l2: chi vừa đúng ngân sách, không có khoản sắp trả: báo đã tiêu hết, không ghi khoản 0đ", "đã tiêu hết ngân sách" in line and "0đ" not in line, line)

        # 2) tuần này so với cùng kỳ tuần trước, không tính khoản cố định
        lp.evaluate("""() => batch(() => {
            put('tx', { type: 'out', amount: 200000, cat: 'an', note: 'ăn tối', date: '2026-10-14', at: 1 });
            put('tx', { type: 'out', amount: 300000, cat: 'an', note: 'ăn tối', date: '2026-10-07', at: 1 });
            put('tx', { type: 'out', amount: 100000, cat: 'an', note: 'ăn khuya', date: '2026-10-11', at: 1 });   // CN tuần trước: hôm nay là CN nên vẫn trong cùng kỳ
            put('tx', { type: 'out', amount: 2500000, cat: 'nha', note: 'tiền phòng', date: '2026-10-05', at: 1 });
        })""")
        w = lp.evaluate("weekSpend()")
        ok("l2: chi tuần này và cùng kỳ tuần trước, bỏ tiền phòng và khoản cố định", w == {"cur": 200000, "prev": 400000}, str(w))
        line = lp.inner_text("main .spendline")
        ok("l2: thẻ Chi tiêu ghi tuần này tiêu bao nhiêu và chênh với tuần trước", "Tuần này tiêu 200k" in line and "−200k so với tuần trước" in line, line)
        lp.context.close()

        # 3) ghi nhanh thông minh: gộp số tiền, hợp giờ, khoản đã ghi hôm nay xuống cuối, bấm liền không trượt nút
        cp = page(b, "sv"); cp.set_default_timeout(3000)
        cp.evaluate("""() => batch(() => {
            const at = (d, h) => { const t = parseYmd(d); t.setHours(h, 0); return +t; };
            for (const d of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']) put('tx', { type: 'out', amount: 30000, cat: 'nuoc', note: 'cà phê', date: d, at: at(d, 7) });
            for (const [d, a] of [['2026-10-12', 35000], ['2026-10-13', 35000], ['2026-10-14', 40000], ['2026-10-18', 35000]]) put('tx', { type: 'out', amount: a, cat: 'an', note: 'cơm trưa', date: d, at: at(d, 12) });
            for (const d of ['2026-10-13', '2026-10-15', '2026-10-16']) put('tx', { type: 'out', amount: 25000, cat: 'nuoc', note: 'trà sữa', date: d, at: at(d, 14) });
            for (const d of ['2026-10-16', '2026-10-16', '2026-10-17']) put('tx', { type: 'out', amount: 10000, cat: 'dilai', note: 'gửi xe', date: d, at: at(d, 19) });
        })""")
        c = cp.evaluate("combos().map(c => c.note + ' ' + c.amount)")
        ok("l2: ghi nhanh gộp cùng ghi chú, lấy số tiền hay gặp nhất", "cơm trưa 35000" in c and not any(x.startswith("cơm trưa 40000") for x in c), str(c))
        ok("l2: ghi nhanh ưu tiên khoản hay ghi quanh giờ này (trà sữa 14h lên trước cà phê 7h dù ít lần hơn)", c.index("trà sữa 25000") < c.index("cà phê 30000"), str(c))
        ok("l2: khoản mỗi ngày một lần đã ghi hôm nay thì xuống cuối", c[-1] == "cơm trưa 35000", str(c))
        first = cp.inner_text("main [data-act=combo][data-i='0']")
        cp.click("main [data-act=combo][data-i='0']"); cp.wait_for_timeout(100)
        cp.click("main [data-act=combo][data-i='0']"); cp.wait_for_timeout(100)
        n = cp.evaluate("all('tx').filter(r => r.data.date === '2026-10-18' && r.data.note === 'trà sữa').length")
        ok("l2: bấm liền hai lần nút ghi nhanh đầu tiên ghi đúng khoản đó hai lần", first.startswith("+ trà sữa") and n == 2, f"{first} / {n}")
        cp.context.close()

        # 4) Theo loại: so với cùng kỳ tháng trước, bấm để xem riêng
        mp = page(b, "sv", 320); mp.set_default_timeout(3000)
        mp.evaluate("""() => batch(() => {
            put('tx', { type: 'out', amount: 120000, cat: 'an', note: 'lẩu', date: '2026-10-03', at: 3 });
            put('tx', { type: 'out', amount: 50000, cat: 'an', note: 'bún', date: '2026-10-17', at: 4 });
            put('tx', { type: 'out', amount: 60000, cat: 'nuoc', note: 'cà phê', date: '2026-10-16', at: 5 });
            put('tx', { type: 'out', amount: 100000, cat: 'an', note: 'phở', date: '2026-09-10', at: 1 });
            put('tx', { type: 'out', amount: 900000, cat: 'an', note: 'tiệc cuối tháng', date: '2026-09-28', at: 2 });   // sau ngày 18: ngoài cùng kỳ
            put('tx', { type: 'out', amount: 90000, cat: 'nuoc', note: 'trà', date: '2026-09-02', at: 2 });
        })""")
        mp.click("#nav [data-tab=money]"); mp.wait_for_timeout(150)
        an = mp.inner_text("main [data-mcat=an]"); nuoc = mp.inner_text("main [data-mcat=nuoc]")
        ok("l2: Theo loại có chênh lệch với cùng kỳ tháng trước", "+70k" in an and "−30k" in nuoc, f"{an!r} {nuoc!r}")
        hs = mp.evaluate("[...document.querySelectorAll('main [data-mcat]')].map(e => e.getBoundingClientRect().height)")
        ok("l2: dòng loại bấm được cao >= 44px ở 320px", hs and min(hs) >= 44, str(hs))
        mp.click("main [data-mcat=an]"); mp.wait_for_timeout(500)
        notes = mp.evaluate("[...document.querySelectorAll('main [data-edit=tx] .t')].map(e => e.textContent)")
        banner = mp.inner_text("#mfilter")
        ok("l2: bấm một loại thì danh sách chỉ còn khoản của loại đó", sorted(notes) == ["bún", "lẩu"], str(notes))
        ok("l2: dải lọc ghi tổng, số khoản và cùng kỳ tháng trước", "170.000đ" in banner and "2 khoản" in banner and "cùng kỳ tháng 9: 100k" in banner, banner)
        ok("l2: dòng đang lọc có aria-pressed", mp.get_attribute("main [data-mcat=an]", "aria-pressed") == "true")
        over = mp.evaluate("document.documentElement.scrollWidth > innerWidth")
        ok("l2: tab Tiền khi lọc không tràn ngang ở 320px", not over)
        mp.click("#mfilter [data-act=mcat-clear]"); mp.wait_for_timeout(150)
        ok("l2: Bỏ lọc thì hiện lại mọi khoản", mp.locator("#mfilter").count() == 0 and mp.locator("main [data-edit=tx]").count() == 3)
        mp.click("main [data-mcat=nuoc]"); mp.wait_for_timeout(150); mp.click("main [data-mcat=nuoc]"); mp.wait_for_timeout(150)
        ok("l2: bấm lại loại đang lọc thì bỏ lọc", mp.locator("#mfilter").count() == 0)

        # 5) "Thêm hôm nay": chép khoản cũ sang hôm nay, khoản cũ giữ nguyên
        old = mp.evaluate("all('tx').find(r => r.data.note === 'lẩu').id")
        mp.click(f"main [data-edit=tx][data-id='{old}']"); mp.wait_for_timeout(350)
        ok("l2: form sửa khoản có nút Thêm hôm nay trong footer", mp.locator(".sheet .sheet-foot [data-dup]").inner_text().strip() == "Thêm hôm nay")
        bw = mp.evaluate("[...document.querySelectorAll('.sheet .sheet-foot .btn')].map(b => [b.getBoundingClientRect().height, b.scrollWidth <= b.clientWidth + 1])")
        ok("l2: ba nút footer vừa 320px, cao >= 44px, chữ một dòng không tràn", all(44 <= h < 56 and fit for h, fit in bw), str(bw))
        mp.click(".sheet [data-dup]"); mp.wait_for_timeout(400)
        dup = mp.evaluate("all('tx').filter(r => r.data.note === 'lẩu').map(r => [r.data.date, r.data.amount]).sort()")
        ok("l2: Thêm hôm nay tạo khoản mới hôm nay, giữ khoản cũ", dup == [["2026-10-03", 120000], ["2026-10-18", 120000]], str(dup))
        mp.click("#toast button"); mp.wait_for_timeout(150)
        ok("l2: Hoàn tác bỏ khoản vừa thêm", mp.evaluate("all('tx').filter(r => r.data.note === 'lẩu').length") == 1)
        mp.context.close()

        # 6) mục tiêu: nhịp mỗi tuần, quá hạn, sửa không làm tròn số
        gp = page(b, "sv"); gp.set_default_timeout(3000)
        ids = gp.evaluate("""() => [put('goal', { name: 'Laptop', emoji: '💻', target: 10000000, saved: 2000000, deadline: '2026-12-12' }).id,
                                    put('goal', { name: 'Đà Lạt', emoji: '🌲', target: 2450000, saved: 600000, deadline: '2026-10-10' }).id]""")
        pace = gp.evaluate(f"goalPace(db['{ids[0]}'].data)")
        ok("l2: mỗi tuần cần góp = còn thiếu / số tuần tới hạn (8 tuần), làm tròn lên nghìn", pace["weeks"] == 8 and pace["perWeek"] == 1000000, str(pace))
        gp.click("#nav [data-tab=money]"); gp.wait_for_timeout(150)
        gl = gp.inner_text("main .goal >> nth=0") + " | " + gp.inner_text("main .goal >> nth=1")
        ok("l2: thẻ mục tiêu ghi ~1tr/tuần và báo quá hạn", "~1tr/tuần đến 12/12" in gl and "quá hạn 10/10" in gl, gl)
        gp.evaluate(f"goalForm('{ids[0]}')"); gp.wait_for_timeout(350)
        ok("l2: form mục tiêu ghi mỗi tuần cần bao nhiêu để kịp hạn", "mỗi tuần cần ~1tr" in gp.inner_text(".sheet [data-pace]") and "~1,9tr/tháng" not in gp.inner_text(".sheet [data-pace]"), gp.inner_text(".sheet [data-pace]"))
        ok("l2: phần tuần này trùng nút 1tr có sẵn thì không thêm nút trùng", gp.locator(".sheet [data-week]").count() == 0)
        gp.evaluate("closeSheet()"); gp.wait_for_timeout(300)
        gp.evaluate(f"goalForm('{ids[1]}')"); gp.wait_for_timeout(350)
        ok("l2: mục tiêu quá hạn không đòi góp theo tháng vô lý", "Đã qua hạn 10/10" in gp.inner_text(".sheet [data-pace]") and "/tháng" not in gp.inner_text(".sheet [data-pace]"), gp.inner_text(".sheet [data-pace]"))
        gp.fill(".sheet [name=deadline]", "2026-11-15"); gp.click(".sheet [data-save]"); gp.wait_for_timeout(350)
        ok("l2: sửa mục tiêu 2.450.000đ không bị làm tròn thành 2,5tr", gp.evaluate(f"db['{ids[1]}'].data.target") == 2450000, str(gp.evaluate(f"db['{ids[1]}'].data.target")))
        gp.evaluate(f"goalForm('{ids[1]}')"); gp.wait_for_timeout(350)
        wk = gp.locator(".sheet [data-week]")
        ok("l2: có nút góp đúng phần tuần này (1.850.000 / 5 tuần = 370k)", wk.count() == 1 and "370k" in wk.inner_text(), wk.inner_text() if wk.count() else "")
        wk.click(); gp.click(".sheet [data-contrib]"); gp.wait_for_timeout(350)
        ok("l2: góp phần tuần này cộng đúng vào mục tiêu", gp.evaluate(f"db['{ids[1]}'].data.saved") == 970000)
        ok("l2: thông báo sau khi góp nói tuần sau còn cần bao nhiêu", "mỗi tuần còn cần ~296k" in gp.inner_text("#toast"), gp.inner_text("#toast"))
        gp.context.close()

        # 7) dọn bản ghi đã xóa: chỉ bản đã được server xác nhận, xóa quá 60 ngày, đúng tài khoản
        tp = page(b, "sv"); tp.set_default_timeout(3000)
        r = tp.evaluate("""() => {
            const old = new Date(Date.now() - 61 * 864e5).toISOString(), recent = new Date(Date.now() - 59 * 864e5).toISOString();
            const mk = (deleted, at, queued) => { const id = crypto.randomUUID(); db[id] = { id, kind: 'tx', data: { type: 'out', amount: 1, cat: 'an', note: 'x', date: '2026-01-01', at: 1 }, deleted, updated_at: at }; if (queued) queue[id] = at; else delete queue[id]; return id; };
            const ids = { gone: mk(true, old, false), queued: mk(true, old, true), recent: mk(true, recent, false), live: mk(false, old, false) };
            const before = gcTombstones(true);   // chưa đăng nhập: không dọn
            sync.user = { id: 'u-1' }; localStorage.setItem('hn-owner', JSON.stringify('u-2'));
            const otherOwner = gcTombstones(true);   // dữ liệu trên máy của tài khoản khác: không dọn
            localStorage.setItem('hn-owner', JSON.stringify('u-1'));
            const n = gcTombstones(true), again = gcTombstones();
            const left = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, !!dbRaw[id]]));
            sync.user = null;
            return { before, otherOwner, n, again, left };
        }""")
        ok("l2: dọn bản đã xóa: chưa đăng nhập hoặc khác tài khoản thì không dọn", r["before"] == 0 and r["otherOwner"] == 0, str(r))
        ok("l2: dọn bản đã xóa: chỉ bỏ bản xóa quá 60 ngày và đã lên server", r["n"] == 1 and r["left"] == {"gone": False, "queued": True, "recent": True, "live": True}, str(r))
        ok("l2: dọn bản đã xóa tối đa một lần mỗi ngày", r["again"] == 0, str(r))
        tp.clock.run_for(1000); tp.wait_for_timeout(400)
        tp.evaluate("settingsSheet()"); tp.wait_for_timeout(350)
        st = tp.inner_text(".sheet [data-store]")
        ok("l2: Cài đặt ghi dung lượng trên máy, số mục xóa còn giữ và đã dọn", st.startswith("Trên máy: khoảng") and "mục đã xóa (giữ để đồng bộ)" in st and "đã tự dọn 1 mục" in st, st)
        tp.context.close()
        # đo: 6.000 bản ghi, 300 bản đã xóa cũ đã lên server (không cài đồng hồ giả để performance.now() là thời gian thật)
        gctx = b.new_context(viewport={"width": 393, "height": 860}, timezone_id="Asia/Ho_Chi_Minh")
        gctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); gctx.route("**/fonts.*/**", lambda r: r.abort())
        tp = gctx.new_page(); tp.on("pageerror", lambda e: errs.append(f"l2 gc: {e}"))
        tp.goto(f"http://127.0.0.1:{PORT}/"); tp.evaluate("localStorage.setItem('hn-onboarded','1')"); tp.reload(); tp.wait_for_timeout(300)
        m = tp.evaluate("""() => {
            const d = {}, old = new Date(Date.now() - 90 * 864e5).toISOString();
            for (let i = 0; i < 6000; i++) { const id = crypto.randomUUID(); d[id] = { id, kind: 'tx', data: { type: 'out', amount: 1000 * i, cat: 'an', note: 'khoản ' + i, date: '2026-07-01', at: i }, deleted: i < 300, updated_at: old }; }
            loadDb(d); queue = {}; sync.user = { id: 'u-1' }; localStorage.setItem('hn-owner', JSON.stringify('u-1'));
            const b0 = JSON.stringify(dbRaw).length, t = performance.now(), n = gcTombstones(true), ms = performance.now() - t, b1 = JSON.stringify(dbRaw).length;
            sync.user = null;
            return { n, ms, saved: b0 - b1, pct: (b0 - b1) / b0 * 100, live: all('tx').length };
        }""")
        print(f"L2 GC: dọn {m['n']} bản đã xóa trong {m['ms']:.1f}ms, bớt {m['saved']} ký tự ({m['pct']:.1f}%)")
        ok(f"l2: dọn 300 bản đã xóa trong 6.000 bản ghi nhanh ({m["ms"]:.1f}ms < 50ms, chạy tối đa 1 lần mỗi ngày), không đụng bản còn dùng", m["n"] == 300 and m["live"] == 5700 and m["ms"] < 50, str(m))
        tp.context.close()

        # 8) sáng, tối, 320px: không có — trong chữ mới, không tràn ngang
        for scheme in ("light", "dark"):
            sp = page(b, "sv", 320, scheme); sp.set_default_timeout(3000)
            sp.evaluate("""() => batch(() => { setSetting('budget', 2000000);
                put('tx', { type: 'out', amount: 300000, cat: 'an', note: 'ăn', date: '2026-10-15', at: 1 });
                put('tx', { type: 'out', amount: 100000, cat: 'an', note: 'ăn', date: '2026-09-15', at: 1 });
                put('task', { title: 'Tiền mạng', type: 'khac', due: '2026-10-28', status: 'todo', amount: 300000, cat: 'hoadon', subs: [] });
                put('goal', { name: 'Quỹ', emoji: '🐷', target: 5000000, saved: 0, deadline: '2026-12-31' }); })""")
            for tab in ("home", "money"):
                sp.click(f"#nav [data-tab={tab}]"); sp.wait_for_timeout(150)
                t = sp.inner_text("main")
                ok(f"l2 {scheme}: tab {tab} 320px không có — và không tràn ngang", "—" not in t and not sp.evaluate("document.documentElement.scrollWidth > innerWidth"))
            sp.click("main [data-mcat=an]"); sp.wait_for_timeout(300)
            col = sp.evaluate("(() => { const s = getComputedStyle(document.querySelector('#mfilter')); return [s.backgroundColor, getComputedStyle(document.body).backgroundColor]; })()")
            ok(f"l2 {scheme}: dải lọc dùng màu theo chế độ", col[0] != col[1], str(col))
            sp.context.close()
    l2()
    b.close()

# ---------- giáo án dán vào (Tập 2.6): đọc giáo án, lưu, thay, hoàn tác, xóa, trạng thái ngày, ghép hiệp, xuất dữ liệu ----------
# Giờ giả lập CN 18/10/2026: tuần này 12/10 tới 18/10. Thẻ gpCard được chèn tạm vào main nếu tab Tập chưa có (trước khi gộp luồng giao diện).
GP_EX_A = "Thứ 2: Hít xà 4x8, Xà kép 3x10, Plank 3x45s\nThứ 4: Goblet squat 4x12 8kg, Lunge 3x10 mỗi chân\nThứ 6: Hít đất para 3x15; Máy đung đưa 20 phút"
GP_EX_B = "**Buổi 1 - Kéo**\n1. Hít xà: 4 hiệp x tối đa (chừa 1-2 lần)\n2. Chèo tạ 1 tay 3 x 12 @8kg - giữ 1 giây ở trên\n**Buổi 2 - Đẩy**\n- Xà kép 4x6-10\n- Pike push-up 3x8"
GP_EX_C = "20/10: Hít xà 5x5, Squat 3x15\n22/10 (Thứ 4)\n- Plank 3x60s\n- Chạy bộ 25 phút"
def gp_it(ex, n, lo=0, hi=0, mx=False, unit="lần", kg="", side=False, note=""):
    return {"ex": ex, "n": n, "lo": lo, "hi": hi, "max": mx, "unit": unit, "kg": kg, "side": side, "note": note}
GP_KEYS = ("ex", "n", "lo", "hi", "max", "unit", "kg", "side", "note")
def gp_items(d): return [{k: i[k] for k in GP_KEYS} for i in d["items"]]
GP_ITEM_JS = "(ex, n, lo, o = {}) => ({ ex, n, lo, hi: 0, max: false, unit: 'lần', kg: '', side: false, note: '', ...o })"
with sync_playwright() as p:
    b = p.chromium.launch()
    def gp_card(pg):   # thẻ Giáo án ở đầu tab Tập (luồng giao diện chèn ${gpCard()} vào viewGym; chưa gộp thì chèn tạm)
        pg.evaluate("() => { closeSheet(); ui.tab = 'gym'; render(); if (!document.querySelector('main [data-gpcard]')) document.querySelector('main').insertAdjacentHTML('afterbegin', gpCard()); }")
        pg.wait_for_timeout(300)
    def gpA():
        gp = page(b, "sv"); gp.set_default_timeout(3000)
        P = lambda t, start="2026-10-18": gp.evaluate("([t, s]) => parseGymPlan(t, { known: EXERCISES.map(e => e[0]), start: s })", [t, start])
        # 1) ba ví dụ bắt buộc trong đặc tả
        a = P(GP_EX_A); d = a["days"]
        ok("gp: ví dụ A có 3 buổi theo thứ T2, T4, T6", [x["dows"] for x in d] == [[1], [3], [5]] and all(not x["date"] and not x["buoi"] and not x["rest"] for x in d) and not a["skipped"], str(a)[:300])
        ok("gp: ví dụ A, Thứ 2 đọc đúng 3 bài", len(d) == 3 and gp_items(d[0]) == [gp_it("Hít xà", 4, 8), gp_it("Xà kép", 3, 10), gp_it("Plank", 3, 45, unit="giây")], str(gp_items(d[0])) if d else "")
        ok("gp: ví dụ A, Thứ 4 có 8kg và mỗi chân", len(d) == 3 and gp_items(d[1]) == [gp_it("Goblet squat", 4, 12, kg=8), gp_it("Lunge", 3, 10, side=True)], str(gp_items(d[1])) if len(d) > 1 else "")
        ok("gp: ví dụ A, Thứ 6 tách bằng ; và 20 phút là 1 lần", len(d) == 3 and gp_items(d[2]) == [gp_it("Hít đất para", 3, 15), gp_it("Máy đung đưa", 1, 20, unit="phút")], str(gp_items(d[2])) if len(d) > 2 else "")
        bb = P(GP_EX_B); d = bb["days"]
        ok("gp: ví dụ B có Buổi 1 Kéo, Buổi 2 Đẩy, chưa gắn thứ", [(x["buoi"], x["name"], x["dows"]) for x in d] == [(1, "Kéo", []), (2, "Đẩy", [])] and not bb["skipped"], str(bb)[:300])
        ok("gp: ví dụ B, hít xà tối đa có ghi chú trong ngoặc; chèo tạ có @8kg và ghi chú sau gạch",
           len(d) == 2 and gp_items(d[0]) == [gp_it("Hít xà", 4, mx=True, note="chừa 1-2 lần"), gp_it("Chèo tạ 1 tay", 3, 12, kg=8, note="giữ 1 giây ở trên")], str(gp_items(d[0])) if d else "")
        ok("gp: ví dụ B, khoảng 6-10 và gạch đầu dòng", len(d) == 2 and gp_items(d[1]) == [gp_it("Xà kép", 4, 6, 10), gp_it("Pike push-up", 3, 8)], str(gp_items(d[1])) if len(d) > 1 else "")
        c = P(GP_EX_C); d = c["days"]
        ok("gp: ví dụ C là 2 buổi theo ngày, năm gần ngày bắt đầu", [(x["date"], x["dows"]) for x in d] == [("2026-10-20", []), ("2026-10-22", [])] and not c["skipped"], str(c)[:300])
        ok("gp: ví dụ C đọc đúng bài", len(d) == 2 and gp_items(d[0]) == [gp_it("Hít xà", 5, 5), gp_it("Squat", 3, 15)] and gp_items(d[1]) == [gp_it("Plank", 3, 60, unit="giây"), gp_it("Chạy bộ", 1, 25, unit="phút")], str([gp_items(x) for x in d]))
        ok("gp: ví dụ C, 22/10/2026 là Thứ Năm nên cảnh báo lệch thứ ghi trong ngoặc", len(d) == 2 and any("Thứ Năm" in w for w in d[1]["warn"]), str(d[1]["warn"]) if len(d) > 1 else "")
        ok("gp: năm của 20/10 theo ngày bắt đầu (tháng 1/2027 thì là 2026)", P("20/10: Hít xà 3x5", "2027-01-05")["days"][0]["date"] == "2026-10-20")
        # 2) các dạng liều khác
        one = lambda s: (P(s)["days"] or [{"items": [{}]}])[0]["items"][0]
        cases = [("Hít xà 4 x 8-10", gp_it("Hít xà", 4, 8, 10)), ("Hít xà 4 hiệp 8 lần", gp_it("Hít xà", 4, 8)), ("Hít xà 4 sets x 8 reps", gp_it("Hít xà", 4, 8)),
                 ("Plank 3x30 giây", gp_it("Plank", 3, 30, unit="giây")), ("Wall sit 3x40s", gp_it("Wall sit", 3, 40, unit="giây")), ("Hít đất 4xmax", gp_it("Hít đất", 4, mx=True)),
                 ("Xà kép 4 x tối đa", gp_it("Xà kép", 4, mx=True)), ("Lunge lùi 3x10 mỗi bên", gp_it("Lunge lùi", 3, 10, side=True)), ("Goblet squat 3x10 8kg", gp_it("Goblet squat", 3, 10, kg=8)),
                 ("Chèo tạ 1 tay 3x12 2,5kg", gp_it("Chèo tạ 1 tay", 3, 12, kg=2.5)), ("hit xa nguoc tay 3x5", gp_it("hit xa nguoc tay".capitalize(), 3, 5)),
                 ("hit xa 3x5", gp_it("Hít xà", 3, 5)), ("Hít xà ngửa tay 3x5", gp_it("Hít xà ngửa tay", 3, 5)), ("Lunge lùi 8 lần x 3 hiệp", gp_it("Lunge lùi", 3, 8)),
                 ("Nhảy dây 1,5 phút", gp_it("Nhảy dây", 1, 90, unit="giây")), ("Hít đất 3x15 (chậm, siết bụng)", gp_it("Hít đất", 3, 15, note="chậm, siết bụng")),
                 ("Hít đất 3x15 - chậm, kiểm soát", gp_it("Hít đất", 3, 15, note="chậm, kiểm soát")), ("4x8 Hít xà", gp_it("Hít xà", 4, 8))]
        bad = [(s, {k: one(s).get(k) for k in GP_KEYS}) for s, want in cases if {k: one(s).get(k) for k in GP_KEYS} != want]
        ok(f"gp: đọc đúng {len(cases)} dạng liều (4 x 8-10, 4 hiệp 8 lần, sets x reps, 30 giây, 40s, max, tối đa, mỗi bên, kg, 2,5kg, không dấu, ngoặc, gạch)", not bad, str(bad)[:400])
        heads = P("T3: Hít xà 3x5\nThứ năm: Xà kép 3x5\nCN: Plank 3x30s\nThứ 2, 4, 6: Squat 3x10\nThứ 7: Nghỉ")["days"]
        ok("gp: tiêu đề T3, Thứ năm, CN, Thứ 2, 4, 6 và Nghỉ", [(x["dows"], x["rest"]) for x in heads] == [([2], False), ([4], False), ([0], False), ([1, 3, 5], False), ([6], True)], str([(x["dows"], x["rest"]) for x in heads]))
        bu = P("Ngày 1: Hít xà 3x5\nDay 2 - Push\n- Xà kép 3x8\nBuổi A: Plank 3x30s")["days"]
        ok("gp: Ngày 1, Day 2, Buổi A là các buổi đánh số", [(x["buoi"], x["name"]) for x in bu] == [(1, ""), (2, "Push"), (1, "")] and [len(x["items"]) for x in bu] == [1, 1, 1], str([(x["buoi"], x["name"], len(x["items"])) for x in bu]))
        md = P("## Thứ 2 💪\n| Bài | Hiệp | Lần |\n|---|---|---|\n| Hít xà | 4 | 8 |\n1️⃣ Xà kép 3x10")["days"]
        ok("gp: bỏ markdown, emoji, bảng | và số dạng 1️⃣", len(md) == 1 and md[0]["dows"] == [1] and gp_items(md[0]) == [gp_it("Hít xà", 4, 8), gp_it("Xà kép", 3, 10)], str(md)[:300])
        # 3) dòng không hiểu, bài thiếu liều, gom Buổi 1
        chat = P("Chắc chắn rồi! Dưới đây là giáo án 3 buổi/tuần cho bạn:\nThứ 2 - Kéo\n- Hít xà 4x8\n- Kéo cáp ngồi\nTuần 1-4 tăng dần số lần\nLưu ý: nghỉ 60-90 giây giữa các hiệp.\nChúc bạn tập tốt!")
        ok("gp: dòng có số mà không hiểu được liệt kê nguyên văn", chat["skipped"] == ["Chắc chắn rồi! Dưới đây là giáo án 3 buổi/tuần cho bạn:", "Tuần 1-4 tăng dần số lần", "Lưu ý: nghỉ 60-90 giây giữa các hiệp."], str(chat["skipped"]))
        ok("gp: câu chào không có số bị bỏ, không thành bài", len(chat["days"]) == 1 and [i["ex"] for i in chat["days"][0]["items"]] == ["Hít xà", "Kéo cáp ngồi"], str(chat["days"])[:300])
        kc = chat["days"][0]["items"][1] if chat["days"] and len(chat["days"][0]["items"]) > 1 else {}
        ok("gp: bài thiếu liều vẫn nhận, 3 hiệp, số lần trống, có cảnh báo", kc.get("n") == 3 and kc.get("lo") == 0 and not kc.get("max") and "Chưa có số lần" in (kc.get("warn") or ""), str(kc))
        nums = P("Thứ 2: Hít xà 4x8\nĐạp xe 5km\nChạy bộ 3km")
        ok("gp: không bao giờ âm thầm bỏ dòng có số (bài lạ vào danh sách bỏ qua, bài quen giữ số trong ghi chú)",
           "Đạp xe 5km" in nums["skipped"] and any(i["ex"] == "Chạy bộ" and i["note"] == "3km" and i["warn"] for i in nums["days"][0]["items"]), str(nums)[:300])
        g1 = P("Hít xà 4x8\nXà kép 3x10\nThứ 4: Plank 3x30s")["days"]
        ok("gp: bài có liều trước tiêu đề đầu tiên được gom vào Buổi 1", len(g1) == 2 and g1[0]["buoi"] == 1 and [i["ex"] for i in g1[0]["items"]] == ["Hít xà", "Xà kép"] and g1[1]["dows"] == [3], str(g1)[:300])
        ok("gp: Buổi không có bài thì bỏ và báo", P("Buổi 1: Hít xà 3x5\nBuổi 2\nBuổi 3: Xà kép 3x5")["warns"] == ["Buổi 2 chưa có bài nào, đã bỏ"])
        ok("gp: gymTarget ghi liều gọn", gp.evaluate(f"(() => {{ const I = {GP_ITEM_JS}; return [gymTarget(I('Xà kép', 4, 8, {{ hi: 10, kg: 8 }})), gymTarget(I('Plank', 3, 45, {{ unit: 'giây' }})), gymTarget(I('Hít xà', 4, 0, {{ max: true, side: true }})), gymTarget(I('Chạy bộ', 1, 20, {{ unit: 'phút' }})), gymTarget(I('Kéo cáp', 3, 0))]; }})()")
           == ["4 × 8-10 · 8kg", "3 × 45 giây", "4 × tối đa · mỗi bên", "20 phút", "3 hiệp"])
        ok("gp: chạm hiệp ghi số thấp của khoảng, tối đa hoặc chưa có số thì hỏi", gp.evaluate(f"(() => {{ const I = {GP_ITEM_JS}; return [gymTickDefault(I('a', 4, 8, {{ hi: 10 }})), gymTickDefault(I('a', 4, 0, {{ max: true }})), gymTickDefault(I('a', 3, 0))]; }})()") == [8, None, None])

        # 4) lưu qua sheet thật: bấm Dán giáo án trên thẻ, dán ví dụ B, đổi thứ, lưu
        gp_card(gp)
        ok("gp: chưa có giáo án thì thẻ mời dán giáo án", gp.locator("main [data-gpcard] [data-act=gp-paste]").count() >= 1 and gp.locator("main [data-gpcard] [data-act=gp-manage]").count() == 0)
        gp.locator("main [data-act=gp-paste]").first.click(); gp.wait_for_timeout(400)
        ok("gp: bấm Dán giáo án mở sheet có nút chép câu ChatGPT, ô dán, ngày bắt đầu mặc định hôm nay",
           gp.locator(".sheet textarea[name=gpsrc]").count() == 1 and gp.locator(".sheet [data-gpask]").count() == 1 and gp.input_value(".sheet [name=gpstart]") == "2026-10-18" and gp.locator(".sheet [data-gpsave]").is_disabled())
        gp.evaluate("navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }")
        gp.click(".sheet [data-gpask]"); gp.wait_for_timeout(100)
        clip = gp.evaluate("window.__clip || ''")
        ok("gp: câu nhờ ChatGPT yêu cầu đúng định dạng app đọc được (Buổi 1, Buổi 2, nghỉ tùy ý)", "Buổi 1 - Tên buổi" in clip and "nghỉ ngày nào cũng được" in clip and "4x8" in clip and "—" not in clip and gp.evaluate("t => parseGymPlan(t).days.length", clip) >= 1, clip[:120])
        gp.fill(".sheet [name=gpsrc]", GP_EX_B); gp.wait_for_timeout(200)
        prev = gp.inner_text(".sheet [data-gpprev]")
        ok("gp: xem trước có buổi, bài, liều qua gymTarget", "Buổi 1" in prev and "Kéo" in prev and "Chèo tạ 1 tay" in prev and "3 × 12 · 8kg" in prev and "4 × tối đa" in prev, prev[:300])
        # mặc định linh hoạt: không bắt chọn thứ, lưu được ngay, mỗi tuần mặc định bằng số buổi
        ok("gp linh hoạt: mặc định chọn Linh hoạt, không có hàng chọn thứ, lưu được ngay",
           gp.locator(".sheet [data-gpmode=rot].on").count() == 1 and gp.locator(".sheet [data-gpdow]").count() == 0 and not gp.locator(".sheet [data-gpsave]").is_disabled()
           and "2 buổi xoay vòng, tập 2 buổi mỗi tuần" in prev and gp.input_value(".sheet [name=gp-per]") == "2", prev[:300])
        gp.click(".sheet [data-gpmode=fix]"); gp.wait_for_timeout(150)
        ok("gp: bấm Cố định theo thứ thì hiện hàng chọn thứ, ẩn số buổi mỗi tuần", gp.locator(".sheet [data-gpdow]").count() == 14 and gp.locator(".sheet [data-gpper]").is_hidden())
        on = lambda bi: gp.evaluate(f"[...document.querySelectorAll('.sheet [data-gpb=\"{bi}\"].on')].map(x => +x.dataset.gpdow)")
        ok("gp: 2 buổi xếp sẵn T2 và T5, mỗi thứ một buổi", on(0) == [1] and on(1) == [4] and not gp.locator(".sheet [data-gpsave]").is_disabled(), str([on(0), on(1)]))
        btn_h = gp.evaluate("Math.min(...[...document.querySelectorAll('.sheet [data-gpdow]')].map(x => x.getBoundingClientRect().height))")
        ok("gp: nút chọn thứ cao ít nhất 44px", btn_h >= 44, str(btn_h))
        gp.click(".sheet [data-gpb='1'][data-gpdow='3']"); gp.wait_for_timeout(100)
        gp.click(".sheet [data-gpb='1'][data-gpdow='4']"); gp.wait_for_timeout(100)
        gp.click(".sheet [data-gpb='0'][data-gpdow='3']"); gp.wait_for_timeout(100)   # T4 sang Buổi 1 thì rời Buổi 2
        ok("gp: chọn một thứ cho buổi này thì buổi kia mất thứ đó", on(0) == [1, 3] and on(1) == [], str([on(0), on(1)]))
        ok("gp: buổi chưa có thứ thì chưa cho lưu và nói rõ", gp.locator(".sheet [data-gpsave]").is_disabled() and "Chọn thứ cho Buổi 2" in gp.inner_text(".sheet [data-gpwhy]"))
        gp.click(".sheet [data-gpb='1'][data-gpdow='3']"); gp.wait_for_timeout(100)
        ok("gp: bấm lại đủ thứ thì lưu được", on(0) == [1] and on(1) == [3] and not gp.locator(".sheet [data-gpsave]").is_disabled(), str([on(0), on(1)]))
        ok("gp: chưa có giáo án nào thì không có dòng Sẽ thay", gp.locator(".sheet .gp-repl").count() == 0)
        gp.fill(".sheet [name=gpname]", "Kéo đẩy")
        gp.click(".sheet [data-gpsave]"); gp.wait_for_timeout(400)
        pl = gp.evaluate("all('gymplan').map(r => r.data)")
        ok("gp: lưu thành một bản ghi gymplan đúng dữ liệu", len(pl) == 1 and pl[0]["name"] == "Kéo đẩy" and pl[0]["start"] == "2026-10-18" and pl[0]["until"] == ""
           and [(x["name"], x["dows"]) for x in pl[0]["days"]] == [("Kéo", [1]), ("Đẩy", [3])] and gp_items(pl[0]["days"][0])[1] == gp_it("Chèo tạ 1 tay", 3, 12, kg=8, note="giữ 1 giây ở trên")
           and "buoi" not in pl[0]["days"][0] and "warn" not in pl[0]["days"][0]["items"][0] and pl[0]["src"].startswith("**Buổi 1"), str(pl)[:400])
        ok("gp: lưu xong toast có Hoàn tác, sheet đóng", "Kéo đẩy" in gp.inner_text("#toast") and gp.locator("#toast button").inner_text() == "Hoàn tác" and gp.locator(".sheet.in").count() == 0)
        gp.click("#toast button"); gp.wait_for_timeout(300)
        ok("gp: Hoàn tác bỏ giáo án vừa lưu", gp.evaluate("all('gymplan').length") == 0)
        gp.clock.run_for(5000); gp.wait_for_timeout(100)
        # 5) thay giáo án cũ: cũ kết thúc hôm trước ngày bắt đầu mới, giáo án tương lai bị bỏ; Hoàn tác trả lại cả hai
        gp.evaluate(f"""(() => {{ const I = {GP_ITEM_JS};
          window.__old = put('gymplan', {{ name: 'Cũ', start: '2026-09-01', until: '', days: [{{ name: 'Kéo', dows: [1], date: '', rest: false, items: [I('Hít xà', 4, 8)] }}] }}).id;
          window.__fut = put('gymplan', {{ name: 'Tương lai', start: '2026-11-02', until: '', days: [{{ name: 'Đẩy', dows: [3], date: '', rest: false, items: [I('Xà kép', 3, 10)] }}] }}).id; }})()""")
        gp_card(gp)
        gp.locator("main [data-act=gp-paste]").first.click(); gp.wait_for_timeout(400)
        gp.fill(".sheet [name=gpsrc]", GP_EX_A + "\nThứ 7: Wall sit 3x40s"); gp.click(".sheet [data-gpst='2026-10-19']"); gp.click(".sheet [data-gpmode=fix]"); gp.wait_for_timeout(200)
        ok("gp: nút Thứ 2 tuần sau đặt ngày bắt đầu 19/10", gp.input_value(".sheet [name=gpstart]") == "2026-10-19" and gp.locator(".sheet [data-gpst='2026-10-12']").count() == 1)
        repl = gp.inner_text(".sheet [data-gpprev]")
        ok("gp: xem trước nói rõ sẽ thay giáo án cũ và bỏ giáo án tương lai", "Sẽ thay giáo án Cũ (kết thúc ngày 18/10/2026)" in repl and "Sẽ bỏ giáo án Tương lai" in repl, repl[:300])
        gp.click(".sheet [data-gpsave]"); gp.wait_for_timeout(400)
        st = gp.evaluate("[db[__old].data.until, !!db[__fut].deleted, all('gymplan').length, gymPlanAt('2026-10-18').data.name, gymPlanAt('2026-10-19').data.name]")
        ok("gp: lưu thì giáo án cũ kết thúc 18/10, giáo án tương lai bị bỏ, từ 19/10 dùng giáo án mới", st == ["2026-10-18", True, 2, "Cũ", "Giáo án 19/10"], str(st))
        ok("gp: exUnit học đơn vị từ giáo án (Wall sit là giây)", gp.evaluate("exUnit('Wall sit')") == "giây" and gp.evaluate("exUnit('Hít xà')") == "lần")
        gp.click("#toast button"); gp.wait_for_timeout(300)
        st = gp.evaluate("[db[__old].data.until, !!db[__fut].deleted, all('gymplan').length]")
        ok("gp: Hoàn tác trả lại giáo án cũ và giáo án tương lai", st == ["", False, 2], str(st))
        ok("gp: giáo án trùng ngày bắt đầu thì bản sửa sau thắng", gp.evaluate("""(() => { const a = put('gymplan', { name: 'X1', start: '2026-10-05', until: '', days: [] }); const b2 = put('gymplan', { name: 'X2', start: '2026-10-05', until: '', days: [] });
            const r = gymPlanAt('2026-10-06').data.name; remove(a.id); remove(b2.id); return r; })()""") == "X2")
        gp.context.close()

        # 6) trạng thái ngày, ghép hiệp với workout cũ (không pi/hs), ghi nhanh, planId khác
        gs = page(b, "sv"); gs.set_default_timeout(3000)
        gs.evaluate(f"""(() => {{ const I = {GP_ITEM_JS};
          window.__P = put('gymplan', {{ name: 'Kiểm thử', start: '2026-10-05', until: '', days: [
            {{ name: 'Kéo', dows: [1], date: '', rest: false, items: [I('Hít xà', 4, 8), I('Plank', 3, 45, {{ unit: 'giây' }})] }},
            {{ name: 'Đẩy', dows: [3], date: '', rest: false, items: [I('Xà kép', 3, 10)] }},
            {{ name: '', dows: [0], date: '', rest: true, items: [] }},
            {{ name: 'Một lần', dows: [], date: '2026-10-21', rest: false, items: [I('Squat', 3, 15)] }}] }}).id;
          const pid = __P;
          window.__w05 = put('workout', {{ date: '2026-10-05', planId: pid, planDate: '2026-10-05', mins: 40, note: 'Ổn', items: [
            {{ ex: 'Plank', pi: 1, hs: [2, 0], sets: [40, 45], note: 'Run tay' }}, {{ ex: 'Hít xà', pi: 0, sets: [5], kg: 0 }}, {{ ex: 'Chạy bộ', sets: [20] }}] }}).id;
          window.__w08 = put('workout', {{ date: '2026-10-08', planId: pid, planDate: '2026-10-07', items: [{{ ex: 'Xà kép', pi: 0, hs: [0, 1, 2], sets: [10, 10, 9] }}] }}).id;
          window.__w12 = put('workout', {{ date: '2026-10-12', mins: 30, items: [{{ ex: 'hit xa', sets: [8, 8, 7] }}], note: '' }}).id;
          window.__w16 = put('workout', {{ date: '2026-10-16', items: [{{ ex: 'Chạy bộ', sets: [25] }}] }}).id;
          window.__w10 = put('workout', {{ date: '2026-10-10', plan: 'A', items: [{{ ex: 'Hít xà', sets: [5, 4] }}] }}).id;
          put('weight', {{ date: '2026-09-27', kg: 80 }}); put('weight', {{ date: '2026-10-11', kg: 79.2 }}); setSetting('weightGoal', 72); }})()""")
        sts = gs.evaluate("['2026-10-04', '2026-10-05', '2026-10-07', '2026-10-08', '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-18', '2026-10-19', '2026-10-21'].map(d => gymStatus(d).st)")
        ok("gp: gymStatus: none, done, made (tập bù), free, done (ghi cũ), missed, free, rest, planned, planned (ngày cụ thể)",
           sts == ["none", "done", "made", "free", "done", "missed", "free", "rest", "planned", "planned"], str(sts))
        s07 = gs.evaluate("(() => { const s = gymStatus('2026-10-07'); return [s.made && s.made.id === __w08, s.ws.length, s.w && s.w.id === __w08, s.day.name]; })()")
        ok("gp: ngày tập bù: made trỏ tới buổi tập bù, gymWorkoutFor trả buổi đó", s07 == [True, 0, True, "Đẩy"], str(s07))
        d21 = gs.evaluate("(() => { const d = gymDay('2026-10-21'); return [d.name, d.once, d.items.length, d.planName, d.di]; })()")
        ok("gp: buổi theo ngày cụ thể thắng buổi theo thứ (21/10 là Thứ Tư)", d21 == ["Một lần", True, 1, "Kiểm thử", 3], str(d21))
        ok("gp: ngày nghỉ trả rest, không có bài", gs.evaluate("(() => { const d = gymDay('2026-10-18'); return d.rest && d.items.length === 0 && d.name === 'Nghỉ'; })()"))
        ok("gp: trước ngày bắt đầu và sau ngày kết thúc thì không có buổi", gs.evaluate("gymDay('2026-10-04') === null && gymPlanAt('2026-10-04') === null"))
        m05 = gs.evaluate("(() => { const m = gymMatch(gymDay('2026-10-05'), db[__w05]); return { rows: m.rows.map(r => [r.k, r.wi, r.done]), extra: m.extra, done: m.done, total: m.total }; })()")
        ok("gp: gymMatch theo pi, hs đúng thứ tự hiệp, thiếu hs là 0..n-1, bài ngoài giáo án vào extra",
           m05 == {"rows": [[0, 1, [{"h": 0, "v": 5}]], [1, 0, [{"h": 0, "v": 45}, {"h": 2, "v": 40}]]], "extra": [2], "done": 3, "total": 7}, str(m05))
        m12 = gs.evaluate("(() => { const m = gymMatch(gymDay('2026-10-12'), gymWorkoutFor('2026-10-12')); return [m.rows[0].wi, m.rows[0].done.map(x => x.h), m.rows[1].wi, m.extra, m.done, m.total]; })()")
        ok("gp: workout cũ không có pi/hs khớp theo tên không dấu", m12 == [0, [0, 1, 2], -1, [], 3, 7], str(m12))
        other = gs.evaluate("(() => { const w = { data: { planId: '00000000-0000-4000-8000-000000000000', items: [{ ex: 'Plank', pi: 0, sets: [30] }] } }; const m = gymMatch(gymDay('2026-10-12'), w); return [m.rows[0].wi, m.rows[1].wi, m.extra]; })()")
        ok("gp: workout của giáo án khác thì bỏ qua pi, khớp theo tên", other == [-1, 0, []], str(other))
        ok("gp: không có buổi thì mọi bài là extra", gs.evaluate("(() => { const m = gymMatch(null, db[__w16]); return m.rows.length === 0 && m.extra.join() === '0' && m.total === 0; })()"))
        gs.evaluate("ui.tab = 'home'; render(); quickReset('hít xà 3x10'); quickSave()"); gs.wait_for_timeout(200)
        qk = gs.evaluate("(() => { const w = gymWorkoutFor('2026-10-18'); const m = gymMatch({ planId: __P, rest: false, items: db[__P].data.days[0].items }, w); return [w.data.items.length, m.rows[0].done.map(x => x.v), m.done]; })()")
        ok("gp: bài ghi nhanh 'hít xà 3x10' khớp vào bài giáo án theo tên", qk == [1, [10, 10, 10], 3], str(qk))
        t0 = gs.evaluate("""(() => { batch(() => { for (let i = 0; i < 400; i++) put('workout', { date: addDays('2025-06-01', i), items: [{ ex: 'Hít xà', sets: [5, 5] }] }); });
            const t = performance.now(); for (let k = 0; k < 3; k++) { put('weight', { date: '2026-10-18', kg: 79 + k / 10 }); put('workout', { date: '2026-10-17', items: [] });
              for (let i = 0; i < 42; i++) gymMatch(gymDay(addDays('2026-09-28', i)), gymStatus(addDays('2026-09-28', i)).w); }
            return (performance.now() - t) / 3; })()""")
        ok(f"gp: lưới tháng 42 ô (gymStatus + gymMatch, 400 buổi) sau mỗi lần ghi nhanh ({t0:.1f}ms < 60ms)", t0 < 60, f"{t0:.1f}ms")
        gs.context.close()

        # 7) NORM: rác bị dọn, plan:"A" và gymPlan cũ giữ nguyên; nạp lại từ localStorage không lỗi (bẫy TDZ khi loadDb)
        nm = page(b, "sv")
        g = nm.evaluate("""JSON.stringify(normalize('gymplan', { start: '<b>', until: 'mai', name: 5, src: 7, days: [{ dows: [1, '2', 9, 'x', 1, true, null], date: 'bad', rest: 'yes', extra: 'giữ',
            items: [{ ex: 7, n: 99, lo: '8', hi: -1, max: 'true', unit: 'kg', kg: 'abc', side: 1 }, 'rác'] }, 'rác', null] }))""")
        ok("gp: NORM gymplan dọn giá trị rác, giữ trường lạ", g == '{"start":"","until":"","name":"5","src":"7","days":[{"dows":[1,2],"date":"","rest":false,"extra":"giữ","items":[{"ex":"7","n":3,"lo":8,"hi":0,"max":false,"unit":"lần","kg":0,"side":false,"note":""}],"name":""}]}', g)
        w = nm.evaluate("""JSON.stringify(normalize('workout', { date: '2026-10-18', plan: 'A', planId: '<img>', planDate: 'hôm qua', items: [
            { ex: 'Hít xà', sets: [8, '7'], pi: '1', hs: [0, '1'] }, { ex: 'Plank', sets: [45], pi: -3, hs: [0, 1] }, { ex: 'X', sets: [1, 2], hs: [1, 1] }, { ex: 'Y', sets: [3], hs: 'x', pi: 2.5 }] }))""")
        ok("gp: NORM workout: planId, planDate, pi, hs sai bị bỏ, plan 'A' giữ nguyên",
           w == '{"date":"2026-10-18","plan":"A","planId":"","planDate":"","items":[{"ex":"Hít xà","sets":[8,7],"pi":1,"hs":[0,1]},{"ex":"Plank","sets":[45]},{"ex":"X","sets":[1,2]},{"ex":"Y","sets":[3]}]}', w)
        ok("gp: NORM giữ planId đúng dạng và gymPlan cũ", nm.evaluate("normalize('workout', { planId: '0f8fad5b-d9cb-469f-a165-70867728950e' }).planId") == "0f8fad5b-d9cb-469f-a165-70867728950e"
           and nm.evaluate("JSON.stringify(normalize('setting', { key: 'gymPlan', value: { on: true, start: '2026-10-01' } }).value)") == '{"on":true,"start":"2026-10-01"}')
        nm.evaluate("""() => { flushPersist(); const d = JSON.parse(localStorage.getItem('hn-db') || '{}');
            d['11111111-1111-4111-8111-111111111111'] = { id: '11111111-1111-4111-8111-111111111111', kind: 'gymplan', deleted: false, updated_at: '2026-10-18T05:00:00.000Z', data: { name: 'Nạp lại', start: '2026-10-01', until: '', days: [{ name: 'Kéo', dows: ['1'], items: [{ ex: 'Wall sit', n: '3', lo: '40', unit: 'giây' }] }] } };
            d['22222222-2222-4222-8222-222222222222'] = { id: '22222222-2222-4222-8222-222222222222', kind: 'workout', deleted: false, updated_at: '2026-10-18T05:00:00.000Z', data: { date: '2026-10-12', planId: '11111111-1111-4111-8111-111111111111', planDate: '2026-10-12', items: [{ ex: 'Wall sit', pi: 0, hs: [1, 0], sets: [40, 35] }] } };
            localStorage.setItem('hn-db', JSON.stringify(d)); }""")
        n_err = len(errs); nm.reload(); nm.wait_for_timeout(400)
        rl = nm.evaluate("(() => { const d = gymDay('2026-10-12'); const m = gymMatch(d, gymWorkoutFor('2026-10-12')); return [d.items[0].n, d.items[0].lo, exUnit('Wall sit'), m.rows[0].done.map(x => x.v)]; })()")
        ok("gp: nạp lại từ máy: chuẩn hóa lúc loadDb không lỗi, số thành số", len(errs) == n_err and rl == [3, 40, "giây", [35, 40]], str(rl))
        nm.context.close()

        # 8) quản lý: đổi tên, đặt ngày kết thúc, xóa giáo án không đụng workout, Hoàn tác
        mg = page(b, "sv"); mg.set_default_timeout(3000)
        mg.evaluate(f"""(() => {{ const I = {GP_ITEM_JS};
          window.__P = put('gymplan', {{ name: 'Đang dùng', start: '2026-10-05', until: '', days: [{{ name: 'Kéo', dows: [1, 4], date: '', rest: false, items: [I('Hít xà', 4, 8, {{ note: 'chậm' }})] }}] }}).id;
          put('gymplan', {{ name: 'Đã xong', start: '2026-08-01', until: '2026-09-30', days: [] }});
          put('workout', {{ date: '2026-10-12', planId: __P, planDate: '2026-10-12', items: [{{ ex: 'Hít xà', pi: 0, hs: [0], sets: [8] }}] }}); put('workout', {{ date: '2026-10-13', items: [{{ ex: 'Plank', sets: [30] }}] }}); }})()""")
        gp_card(mg)
        card = mg.inner_text("main [data-gpcard]")
        ok("gp: thẻ Giáo án có tên, từ ngày, số buổi, nút Dán / Quản lý / Xuất", "Đang dùng" in card and "Từ 05/10/2026" in card and "2 buổi mỗi tuần (T2, T5)" in card
           and mg.locator("main [data-gpcard] [data-act=gp-manage]").count() == 1 and mg.locator("main [data-gpcard] [data-act=gp-export]").count() == 1, card)
        mg.locator("main [data-gpcard] [data-act=gp-manage]").click(); mg.wait_for_timeout(400)
        sh = mg.inner_text(".sheet")
        ok("gp: Quản lý mở giáo án đang dùng, xem các buổi và giáo án đã kết thúc", mg.input_value(".sheet [name=gpmname]") == "Đang dùng" and "Thứ Hai, Thứ Năm" in sh and "4 × 8" in sh and "chậm" in sh and "Đã xong" in sh and "đã kết thúc" in sh, sh[:300])
        mg.fill(".sheet [name=gpmname]", "Đổi tên"); mg.fill(".sheet [name=gpmuntil]", "2026-10-01"); mg.click(".sheet [data-gpsave]"); mg.wait_for_timeout(300)
        ok("gp: ngày kết thúc trước ngày bắt đầu thì báo, không lưu", mg.evaluate("db[__P].data.name") == "Đang dùng" and mg.locator(".sheet.in").count() == 1)
        mg.fill(".sheet [name=gpmuntil]", "2026-12-31"); mg.click(".sheet [data-gpsave]"); mg.wait_for_timeout(300)
        ok("gp: đổi tên và đặt ngày kết thúc", mg.evaluate("[db[__P].data.name, db[__P].data.until]") == ["Đổi tên", "2026-12-31"])
        mg.clock.run_for(3000); mg.wait_for_timeout(100)
        mg.evaluate("gpClick('gp-manage', { dataset: { id: __P } })"); mg.wait_for_timeout(400)
        mg.click(".sheet [data-gpnountil]"); mg.click(".sheet [data-gpsave]"); mg.wait_for_timeout(300)
        ok("gp: bỏ ngày kết thúc", mg.evaluate("db[__P].data.until") == "")
        mg.clock.run_for(3000); mg.wait_for_timeout(100)
        before = mg.evaluate("JSON.stringify(all('workout').map(r => [r.id, r.updated_at]).sort())")
        mg.evaluate("gpClick('gp-manage', { dataset: { id: __P } })"); mg.wait_for_timeout(400)
        mg.click(".sheet [data-gpdel]"); mg.wait_for_timeout(300)
        ok("gp: Xóa giáo án không đụng workout đã tập", mg.evaluate("!!db[__P].deleted") and mg.evaluate("JSON.stringify(all('workout').map(r => [r.id, r.updated_at]).sort())") == before and mg.evaluate("gymDay('2026-10-12') === null"))
        ok("gp: xóa xong toast có Hoàn tác", "Các buổi đã tập vẫn còn" in mg.inner_text("#toast") and mg.locator("#toast button").inner_text() == "Hoàn tác")
        mg.click("#toast button"); mg.wait_for_timeout(300)
        ok("gp: Hoàn tác xóa trả lại giáo án", mg.evaluate("!db[__P].deleted && gymDay('2026-10-12').name === 'Kéo'"))
        mg.context.close()

        # 9) xuất dữ liệu tập: chữ và CSV
        xp2 = page(b, "sv"); xp2.set_default_timeout(3000)
        xp2.evaluate(f"""(() => {{ const I = {GP_ITEM_JS};
          window.__P = put('gymplan', {{ name: 'Kiểm thử', start: '2026-10-05', until: '', days: [
            {{ name: 'Kéo', dows: [1], date: '', rest: false, items: [I('Hít xà', 4, 8, {{ kg: 0 }}), I('Plank', 3, 45, {{ unit: 'giây' }})] }},
            {{ name: 'Đẩy', dows: [3], date: '', rest: false, items: [I('Xà kép', 3, 10, {{ hi: 12 }})] }}] }}).id;
          put('workout', {{ date: '2026-10-05', planId: __P, planDate: '2026-10-05', mins: 40, note: 'Ổn', items: [
            {{ ex: 'Plank', pi: 1, hs: [2, 0], sets: [40, 45], note: 'Run tay' }}, {{ ex: 'Hít xà', pi: 0, sets: [8, 8, 7, 6], kg: 4 }}, {{ ex: 'Chạy bộ', sets: [20] }}] }});
          put('workout', {{ date: '2026-10-08', planId: __P, planDate: '2026-10-07', items: [{{ ex: 'Xà kép', pi: 0, hs: [0, 1, 2], sets: [10, 10, 9] }}] }});
          put('workout', {{ date: '2026-10-10', plan: 'A', mins: 30, items: [{{ ex: 'Hít xà', sets: [5, 4] }}] }});
          put('workout', {{ date: '2026-08-01', items: [{{ ex: 'Hít xà', sets: [3] }}] }});
          put('weight', {{ date: '2026-09-27', kg: 80 }}); put('weight', {{ date: '2026-10-11', kg: 79.2 }}); setSetting('weightGoal', 72);
          navigator.clipboard.writeText = t => {{ window.__clip = t; return Promise.resolve(); }}; navigator.canShare = undefined; }})()""")
        gp_card(xp2)
        xp2.locator("main [data-act=gp-export]").first.click(); xp2.wait_for_timeout(400)
        ok("gp: sheet xuất mặc định 4 tuần, có Chép văn bản và Tải CSV", xp2.locator(".sheet [data-r='4w'].on").count() == 1 and xp2.locator(".sheet [data-gpcopy]").inner_text() == "Chép văn bản" and xp2.locator(".sheet [data-gpcsv]").inner_text() == "Tải CSV")
        txt = xp2.inner_text(".sheet [data-gpxpre]")
        want = ["Dữ liệu tập luyện từ 21/09/2026 đến 18/10/2026", "Giáo án: Kiểm thử (từ 05/10/2026; T2 Kéo, T4 Đẩy)",
                "Thứ Hai 05/10/2026 · Buổi Kéo · 40 phút", "- Hít xà: dự kiến 4 × 8 · làm 8 8 7 6 · 4kg", "- Plank: dự kiến 3 × 45 giây · làm 45 40 giây · ghi chú: Run tay",
                "- Chạy bộ (ngoài giáo án): làm 20 phút", "Ghi chú buổi: Ổn", "Thứ Năm 08/10/2026 · Buổi Đẩy (tập bù cho 07/10)", "- Xà kép: dự kiến 3 × 10-12 · làm 10 10 9",
                "Thứ Bảy 10/10/2026 · Buổi A (giáo án cũ) · 30 phút", "Thứ Hai 12/10/2026 · Buổi Kéo: bỏ lỡ (Hít xà, Plank)", "Thứ Tư 14/10/2026 · Buổi Đẩy: bỏ lỡ (Xà kép)",
                "Tóm tắt: Đã tập 2/4 buổi theo giáo án, thêm 1 buổi tự do", "Cân nặng: 80 kg (27/09) đến 79,2 kg (11/10)", "Mục tiêu cân nặng: 72 kg"]
        miss = [x for x in want if x not in txt]
        ok("gp: văn bản xuất có từng buổi, dự kiến và đã làm, bỏ lỡ, tập bù, giáo án cũ, tóm tắt cân nặng", not miss and "01/08" not in txt and "—" not in txt, str(miss) + " | " + txt[:600])
        xp2.click(".sheet [data-gpcopy]"); xp2.wait_for_timeout(200)
        ok("gp: Chép văn bản chép đúng chữ đang xem", xp2.evaluate("window.__clip") == txt.strip() or xp2.evaluate("window.__clip").strip() == txt.strip())
        with xp2.expect_download() as dl:
            xp2.click(".sheet [data-gpcsv]")
        import tempfile as _tf
        cpath = os.path.join(_tf.mkdtemp(), "tap.csv"); dl.value.save_as(cpath)
        raw = open(cpath, "rb").read(); lines = raw.decode("utf-8-sig").split("\r\n")
        ok("gp: CSV có BOM, tên file tap-luyen-…, dòng tiêu đề đủ cột", raw.startswith(b"\xef\xbb\xbf") and dl.value.suggested_filename == "tap-luyen-2026-10-18.csv"
           and lines[0] == '"Ngày","Thứ","Buổi","Giáo án","Bài","Hiệp","Số lần/giây/phút","Đơn vị","Kg","Mục tiêu","Ghi chú bài","Ghi chú buổi","Phút buổi"', lines[0])
        plank = [l for l in lines if '"Plank"' in l]
        ok("gp: CSV mỗi hiệp một dòng, số hiệp theo hs", len(lines) == 1 + 4 + 2 + 1 + 3 + 2 and len(plank) == 2 and plank[0].split(",")[5] == '"1"' and plank[1].split(",")[5] == '"3"'
           and plank[0] == '"05/10/2026","Thứ Hai","Kéo","Kiểm thử","Plank","1","45","giây","","3 × 45 giây","Run tay","Ổn","40"', "\n".join(lines[:6]))
        ok("gp: CSV có buổi giáo án cũ A", any('"A (giáo án cũ)"' in l for l in lines))
        xp2.click(".sheet [data-r='all']"); xp2.wait_for_timeout(200)
        ok("gp: chọn Tất cả thì có cả buổi cũ 01/08", "01/08/2026" in xp2.inner_text(".sheet [data-gpxpre]"))
        xp2.evaluate("closeSheet()"); xp2.wait_for_timeout(300)
        xp2.evaluate("all('workout').filter(r => r.data.date >= '2026-09-01').forEach(r => remove(r.id))")
        xp2.evaluate("gpClick('gp-export')"); xp2.wait_for_timeout(400)
        ok("gp: không có buổi tập trong khoảng thì khóa nút và giải thích", xp2.locator(".sheet [data-gpcopy]").is_disabled() and xp2.locator(".sheet [data-gpcsv]").is_disabled()
           and "Chưa có buổi tập nào trong 4 tuần gần đây" in xp2.inner_text(".sheet [data-gpxsum]"))
        xp2.click(".sheet [data-r='all']"); xp2.wait_for_timeout(200)
        ok("gp: khoảng Tất cả có buổi cũ thì mở khóa", not xp2.locator(".sheet [data-gpcopy]").is_disabled())
        xp2.context.close()

        # 10) 320px, sáng và tối: không tràn ngang, không có gạch ngang dài
        for scheme in ("light", "dark"):
            np_ = page(b, "sv", 320, scheme); np_.set_default_timeout(3000)
            np_.evaluate("put('gymplan', { name: 'Một tên giáo án khá dài để thử xuống dòng', start: '2026-10-05', until: '2026-12-31', days: [{ name: 'Kéo', dows: [1, 3, 5], date: '', rest: false, items: [{ ex: 'Bulgarian split squat', n: 4, lo: 8, hi: 12, max: false, unit: 'lần', kg: 8, side: true, note: '' }] }] }); put('workout', { date: '2026-10-12', items: [{ ex: 'Bulgarian split squat', sets: [8, 8] }] })")
            gp_card(np_)
            ok(f"gp 320 {scheme}: thẻ Giáo án không tràn ngang, nút cao ít nhất 44px", np_.evaluate("document.documentElement.scrollWidth") <= 320
               and np_.evaluate("Math.min(...[...document.querySelectorAll('main [data-gpcard] .btn')].map(x => x.getBoundingClientRect().height))") >= 44)
            for act, fill in (("gp-paste", True), ("gp-manage", False), ("gp-export", False)):
                np_.evaluate(f"gpClick('{act}')"); np_.wait_for_timeout(400)
                if fill: np_.fill(".sheet [name=gpsrc]", GP_EX_B + "\nTuần 1-4 tăng dần\n- Kéo cáp ngồi"); np_.wait_for_timeout(200)
                wide = np_.evaluate("(() => { const s = document.querySelector('.sheet'); return [...s.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > s.getBoundingClientRect().right + 0.5 && e.getClientRects().length).map(e => e.tagName + '.' + e.className).slice(0, 3); })()")
                ok(f"gp 320 {scheme}: sheet {act} không tràn ngang, không có —", not wide and "—" not in np_.inner_text(".sheet"), str(wide))
                np_.evaluate("closeSheet()"); np_.wait_for_timeout(300)
            np_.context.close()

        # 11) XSS: giáo án và buổi tập độc (riêng, không đụng evil_items) ở thẻ, sheet dán, quản lý, xuất
        xs = page(b, "sv", init=XSS_INIT); xs.set_default_timeout(3000)
        evil = []
        pid = str(uuid.uuid4())
        evil.append({"id": pid, "kind": "gymplan", "updated_at": "2026-10-18T05:00:00.000Z", "data": {"name": X("gp_name"), "start": "2026-10-01", "until": X("gp_until"), "src": X("gp_src"),
            "days": [{"name": X("gp_dname"), "dows": [0, 1, 2, 3, 4, 5, 6], "date": "", "rest": False, "items": [{"ex": X("gp_ex"), "n": X("gp_n"), "lo": X("gp_lo"), "hi": 0, "max": False, "unit": X("gp_unit"), "kg": X("gp_kg"), "side": False, "note": X("gp_note")}]},
                     {"name": X("gp_dname2"), "dows": [], "date": "2026-10-15", "rest": False, "items": [{"ex": X("gp_ex2"), "n": 3, "lo": 5, "note": X("gp_note2")}]}]}})
        evil.append({"id": str(uuid.uuid4()), "kind": "gymplan", "updated_at": "2026-10-18T05:00:00.000Z", "data": {"name": X("gp_name_old"), "start": "2026-08-01", "until": "2026-09-01", "days": []}})
        evil.append({"id": str(uuid.uuid4()), "kind": "workout", "updated_at": "2026-10-18T05:00:00.000Z", "data": {"date": "2026-10-14", "planId": pid, "planDate": "2026-10-14", "pname": X("gp_pname"), "mins": X("gp_mins"), "note": X("gp_wnote"),
            "items": [{"ex": X("gp_wex"), "sets": [5, X("gp_set")], "kg": X("gp_wkg"), "note": X("gp_inote"), "tgt": X("gp_tgt"), "pi": 0, "hs": [0, 1]}]}})
        def gp_visit(pg):
            pg.evaluate("""async () => {
              const wait = ms => new Promise(r => setTimeout(r, ms));
              closeSheet(); ui.tab = 'gym'; render(); if (!document.querySelector('main [data-gpcard]')) document.querySelector('main').insertAdjacentHTML('afterbegin', gpCard());
              for (const r of all('gymplan')) { gpClick('gp-manage', { dataset: { id: r.id } }); await wait(40); closeSheet(); await wait(10); }
              gpClick('gp-export'); await wait(40);
              for (const k of ['3m', 'all']) { document.querySelector(`.sheet [data-r="${k}"]`).click(); await wait(30); }
              closeSheet(); await wait(10);
              gpClick('gp-paste'); await wait(40);
              const t = document.querySelector('.sheet [name=gpsrc]');
              t.value = 'Thứ 2 - <img data-xss=gp_paste_name src=x>: <img data-xss=gp_paste_ex src=x> 3x5 (<img data-xss=gp_paste_note src=x>)\\n<img data-xss=gp_paste_skip src=x> 12\\n20/10 (<img data-xss=gp_paste_dow src=x>)\\n- Hít xà 3x5';
              t.dispatchEvent(new Event('input', { bubbles: true })); await wait(40);
              closeSheet();
            }""")
            pg.clock.run_for(500); pg.wait_for_timeout(200)
            return pg.evaluate("__xss")
        xs.evaluate("items => { for (const r of items) db[r.id] = { ...r, deleted: false }; render(); }", evil)
        hits = gp_visit(xs)
        ok("xss: giáo án và buổi tập độc ghi thẳng vào máy không thành thẻ HTML (thẻ, dán, quản lý, xuất)", not hits, str(hits))
        ok("csp: các sheet giáo án không vi phạm CSP", not xs.evaluate("__csp"), str(xs.evaluate("__csp"))[:200])
        xs.context.close()
        xs = page(b, "sv", init=XSS_INIT); xs.set_default_timeout(3000)
        xs.evaluate("j => mergeBackup(j)", {"app": "hom-nay", "version": 1, "items": evil})
        hits = gp_visit(xs)
        ok("xss: giáo án độc trong file sao lưu không thành thẻ HTML", not hits, str(hits))
        xs.context.close()
    gpA()
    b.close()

# ---------- 2.7.0: dữ liệu an toàn, ghi nhanh, âm lịch, tập, giao diện, đồng bộ ----------
import uuid as _uuid, json as _json
def U(): return str(_uuid.uuid4())
with sync_playwright() as p:
    b = p.chromium.launch()

    # 1) cài đặt và giấy tờ sai kiểu không làm trắng trang (NORM_SETTING, NORM.doc); render() lỗi thì có thông báo
    fz = page(b, "sv"); fz.set_default_timeout(4000)
    BAD = [123, "abc", None, {}, [], [1, 2], {"a": 1}, True, [None, {"k": 1}]]
    KEYS = ["hiddenCats", "modules", "persona", "tiet", "name", "customCats", "catBudget", "tietCustom", "budget", "credits", "weightGoal", "gymPlan"]
    for i, v in enumerate(BAD):
        items = [{"id": U(), "kind": "setting", "updated_at": f"2026-10-18T0{5 + i % 4}:00:0{i}.000Z", "data": {"key": k, "value": v}} for k in KEYS]
        items += [{"id": U(), "kind": "doc", "updated_at": "2026-10-18T05:00:00.000Z", "data": {"name": v, "fields": v, "order": v}},
                  {"id": U(), "kind": "doc", "updated_at": "2026-10-18T05:00:00.000Z", "data": {"name": "Tôi", "fields": [v, {"k": v, "v": v}, {"k": "SĐT", "v": "0901"}]}}]
        fz.evaluate("j => mergeBackup(j)", {"app": "hom-nay", "version": 1, "items": items})
        bad = []
        for tab in ("home", "task", "cal", "money", "gym"):
            fz.evaluate(f"ui.tab = '{tab}'; render()")
            if not fz.evaluate("document.querySelector('#main').innerText.trim().length > 20") or fz.locator("main .crash").count(): bad.append(tab)
        for sh in ("settingsSheet()", "docsSheet()", "catsSheet()", "searchSheet()"):
            fz.evaluate(f"closeSheet(); {sh}"); fz.wait_for_timeout(60)
            if not fz.locator(".sheet").count(): bad.append(sh)
        did = fz.evaluate("all('doc')[0] && all('doc')[0].id")
        if did: fz.evaluate(f"docForm('{did}')"); fz.wait_for_timeout(60)
        fz.evaluate("closeSheet()"); fz.wait_for_timeout(300)
        ok(f"2.7 dữ liệu: cài đặt và giấy tờ sai kiểu ({_json.dumps(v)[:20]}) không làm sập màn hình nào", not bad, str(bad))
    ok("2.7 dữ liệu: luật NORM cho cài đặt", fz.evaluate("""() => [normalize('setting', { key: 'hiddenCats', value: 123 }).value, normalize('setting', { key: 'persona', value: 'xx' }).value,
        normalize('setting', { key: 'modules', value: { cal: false, gym: 'x' } }).value, normalize('setting', { key: 'tiet', value: 5 }).value, normalize('setting', { key: 'name', value: 7 }).value]""")
       == [[], "", {"cal": False}, "", "7"])
    ok("2.7 dữ liệu: ngày không có thật lùi về cuối tháng (giữ hạn), giờ sai thành rỗng", fz.evaluate("""() => { const t = normalize('task', { due: '2026-11-31', until: '2027-02-30', time: '99:99', day: 40 }); const u = normalize('task', { due: '2028-02-29', time: '23:59', day: '31' });
        const w = normalize('task', { due: '2026-13-01', until: '2026-00-10' });
        return [t.due, t.until, t.time, t.day, u.due, u.time, u.day, w.due, w.until]; }""") == ["2026-11-30", "2027-02-28", "", "", "2028-02-29", "23:59", 31, "", ""])
    # render() lỗi: thông báo tiếng Việt có nút tải bản sao lưu và tải lại, thanh tab vẫn còn
    n0 = len(errs)
    fz.evaluate("window.__vt = viewTasks; viewTasks = () => { throw new Error('thử lỗi'); }; ui.tab = 'task'; render()")
    fz.wait_for_timeout(100)
    ok("2.7 dữ liệu: lỗi khi vẽ thì hiện thông báo, nút Tải bản sao lưu và Tải lại", fz.locator("main .crash [data-act=export]").count() == 1 and fz.locator("main .crash [data-act=reload]").count() == 1
       and "thử lỗi" in fz.inner_text("main .crash") and fz.locator("#nav [data-tab=home]").count() == 1 and "—" not in fz.inner_text("main"))
    fz.click("#nav [data-tab=home]"); fz.wait_for_timeout(150)
    ok("2.7 dữ liệu: sau lỗi vẫn chuyển được sang tab khác", fz.locator("main .crash").count() == 0 and fz.locator("#qIn").count() == 1)
    fz.evaluate("viewTasks = window.__vt; render()")
    ok("2.7 dữ liệu: lỗi vẽ vẫn được báo ra (để kiểm thử bắt được)", any("thử lỗi" in e for e in errs[n0:]))
    del errs[n0:]
    fz.context.close()

    # 2) khoản phải trả: không ghi chi hai lần, bỏ Xong thì xóa khoản chi tự ghi (Hoàn tác trả lại)
    pt = page(b, "work"); pt.set_default_timeout(4000)
    tid = pt.evaluate("put('task', { title: 'Tiền điện', type: 'khac', due: '2026-10-18', status: 'todo', amount: 450000, cat: 'nha', subs: [] }).id")
    ntx = lambda: pt.evaluate(f"all('tx').filter(x => x.data.fromTask === '{tid}').length")
    seq = []
    for _ in range(3):
        pt.evaluate(f"toggleTask('{tid}')"); pt.wait_for_timeout(50); seq.append(ntx())
    ok("2.7 trả tiền: Xong → bỏ Xong → Xong lại chỉ có một khoản chi", seq == [1, 0, 1], str(seq))
    ok("2.7 trả tiền: chi tháng tính 450k, không phải 900k", pt.evaluate("sumOut(monthTx('2026-10'))") == 450000)
    pt.evaluate(f"toggleTask('{tid}')"); pt.wait_for_timeout(50)
    ok("2.7 trả tiền: bỏ Xong báo đã xóa khoản chi tự ghi", "xóa khoản chi" in pt.inner_text("#toast") and ntx() == 0, pt.inner_text("#toast"))
    pt.click("#toast button"); pt.wait_for_timeout(100)
    ok("2.7 trả tiền: Hoàn tác bỏ Xong trả lại việc đã xong và khoản chi", ntx() == 1 and pt.evaluate(f"db['{tid}'].data.status") == "done")
    pt.clock.run_for(5000); pt.wait_for_timeout(100)
    # form: đổi trạng thái từ Xong sang Cần làm cũng xóa khoản chi tự ghi
    pt.evaluate(f"taskForm('{tid}')"); pt.wait_for_timeout(350)
    pt.click(".sheet [data-pick=status] [data-v=todo]") if pt.locator(".sheet details.more[open]").count() else (pt.click(".sheet details.more summary"), pt.click(".sheet [data-pick=status] [data-v=todo]")); pt.click(".sheet [data-save]"); pt.wait_for_timeout(300)
    ok("2.7 trả tiền: form đổi Xong thành Cần làm xóa khoản chi tự ghi", ntx() == 0 and pt.evaluate(f"db['{tid}'].data.status") == "todo")
    pt.clock.run_for(5000); pt.wait_for_timeout(100)

    # 3) lặp hằng tháng/năm giữ ngày gốc; âm lịch; kiểu lặp lạ không lặp
    chain = lambda d: pt.evaluate("""d => { let r = put('task', { title: 'Lặp ' + d.due + d.repeat, type: 'khac', due: d.due, repeat: d.repeat, status: 'todo', subs: [] }); const out = [];
        for (let i = 0; i < d.n; i++) { toggleTask(r.id); const nx = all('task').find(x => x.data.series === (r.data.series || r.id) && x.data.status === 'todo'); if (!nx) break; out.push(nx.data.due); r = nx; }
        return out; }""", d)
    ok("2.7 lặp: hằng tháng 31/1 → 28/2 → 31/3 → 30/4", chain({"due": "2027-01-31", "repeat": "month", "n": 3}) == ["2027-02-28", "2027-03-31", "2027-04-30"])
    ok("2.7 lặp: hằng năm 29/2 → 28/2 → … → 29/2 năm nhuận", chain({"due": "2028-02-29", "repeat": "year", "n": 4}) == ["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"])
    want = pt.evaluate("[LUNAR.toSolar(10, 9, 2027), LUNAR.toSolar(10, 9, 2028)]")
    ok("2.7 lặp: hằng năm âm lịch (giỗ 10/9 âm)", chain({"due": "2026-10-19", "repeat": "lunar-year", "n": 2}) == want, str(want))
    got = chain({"due": "2026-11-08", "repeat": "lunar-month", "n": 4})
    ok("2.7 lặp: hằng tháng âm lịch ngày 30, tháng thiếu lấy 29 rồi lại về 30", pt.evaluate("ds => ds.map(d => LUNAR.text(d))", got) == ["30/10", "30/11", "29/12", "30/1"], str(got))
    ok("2.7 lặp: việc cũ (chưa có day) hạn 28/2 vẫn lặp theo ngày của hạn", chain({"due": "2027-02-28", "repeat": "month", "n": 1}) == ["2027-03-28"])
    r = pt.evaluate("""() => { const r = put('task', { title: 'Từ bản mới', type: 'khac', due: '2026-10-18', repeat: 'tuan-le', status: 'todo', subs: [] }); toggleTask(r.id); render();
        return [all('task').filter(x => x.data.title === 'Từ bản mới').length, normalize('task', { repeat: 'tuan-le' }).repeat, normalize('task', { repeat: 5 }).repeat]; }""")
    ok("2.7 lặp: kiểu lặp lạ (bản mới hơn) giữ nguyên, không tự tạo lần sau", r == [1, "tuan-le", ""], str(r))
    # form: chọn lặp âm lịch thì thấy ngày âm; dòng việc có ngày âm
    pt.evaluate("taskForm(null, { title: 'Giỗ ông', due: '2026-10-19' })"); pt.wait_for_timeout(350)
    pt.click(".sheet details.more summary"); pt.click(".sheet [data-pick=repeat] [data-v=lunar-year]"); pt.wait_for_timeout(50)
    ok("2.7 lặp: form việc có lựa chọn lặp âm lịch, hiện ngày âm của hạn", "10/9" in pt.inner_text(".sheet [data-lunarhint]"))
    pt.click(".sheet [data-save]"); pt.wait_for_timeout(300)
    ok("2.7 lặp: lưu giỗ có day = ngày âm", pt.evaluate("(() => { const t = all('task').find(x => x.data.title === 'Giỗ ông'); return [t.data.repeat, t.data.day]; })()") == ["lunar-year", 10])
    pt.evaluate("ui.tab = 'task'; render()")
    row = pt.locator("main .row", has_text="Giỗ ông").inner_text()
    ok("2.7 lặp: dòng việc lặp âm lịch có ngày âm", "10/9 âm" in row and "Hằng năm âm lịch" in row, row)
    pt.evaluate("put('task', { title: 'Hạn năm sau', type: 'khac', due: '2027-03-10', status: 'todo', subs: [] }); render()")
    ok("2.7 ngày: hạn khác năm nay ghi cả năm", "10/03/2027" in pt.locator("main .row", has_text="Hạn năm sau").inner_text())
    pt.context.close()

    # 4) ghi nhanh: bài trong giáo án, kg, km vào ghi chú, nhiều khoản theo "+", âm lịch trong xem trước
    gq = page(b, "sv"); gq.set_default_timeout(4000)
    gq.evaluate("""put('gymplan', { name: 'GA', start: '2026-10-01', until: '', src: '', days: [{ name: 'Ngực', dows: [1], date: '', rest: false,
        items: [{ ex: 'Bench press', n: 4, lo: 8, hi: 10, max: false, unit: 'lần', kg: 40, side: false, note: '' }, { ex: 'Ép ngực máy', n: 3, lo: 12, hi: 0, max: false, unit: 'lần', kg: '', side: false, note: '' }] }] })""")
    r = gq.evaluate("(() => { const q = parseQuick('ép ngực máy 12 10 10 25kg', quickOpts()); return q && [q.kind, q.data.ex, q.data.sets, q.data.kg]; })()")
    ok("2.7 ghi nhanh: nhận tên bài trong giáo án đã dán, đọc kg", r == ["workout", "Ép ngực máy", [12, 10, 10], 25], str(r))
    gq.fill("#qIn", "bench press 4x8 40kg"); gq.keyboard.press("Enter"); gq.wait_for_timeout(200)
    gq.fill("#qIn", "chạy 5km 30 phút"); gq.keyboard.press("Enter"); gq.wait_for_timeout(200)
    its = gq.evaluate("all('workout').flatMap(w => w.data.items).map(i => [i.ex, i.sets, +i.kg || 0, i.note || ''])")
    ok("2.7 ghi nhanh: lưu bài có kg, chạy có km trong ghi chú (sets chỉ là phút)", ["Bench press", [8, 8, 8, 8], 40, ""] in its and ["Chạy bộ", [30], 0, "5km"] in its, str(its))
    gq.clock.run_for(5000); gq.wait_for_timeout(100)
    gq.fill("#qIn", "cơm 35k + nước 10k"); gq.wait_for_timeout(100)
    ok("2.7 ghi nhanh: 'cơm 35k + nước 10k' xem trước đủ 2 khoản", gq.locator("#qPrev .qrow").count() == 2 and "Lưu 2 khoản" in gq.inner_text("#qPrev"))
    gq.fill("#qIn", "giỗ ông nội mùng 10 tháng 9 âm"); gq.wait_for_timeout(100)
    ok("2.7 ghi nhanh: xem trước giỗ có ngày âm và lặp hằng năm âm lịch", "(10/9 âm)" in gq.inner_text("#qPrev") and "Hằng năm âm lịch" in gq.inner_text("#qPrev"), gq.inner_text("#qPrev"))
    gq.fill("#qIn", "đi khám 10/3"); gq.wait_for_timeout(100)
    ok("2.7 ghi nhanh: ngày khác năm nay, xem trước ghi cả năm", "10/03/2027" in gq.inner_text("#qPrev"), gq.inner_text("#qPrev"))
    ok("2.7 ghi nhanh: tắt mục Tập thì 'in ảnh 4x6' vẫn là việc (chỉ đoán bài lạ NxM khi bật Tập)",
       gq.evaluate("[parseQuick('in ảnh 4x6', { ...quickOpts(), gym: false }).kind, parseQuick('deadlift 5x5 80kg', { ...quickOpts(), gym: true }).kind]") == ["task", "workout"])
    ok("2.7 âm lịch: rằm hằng tháng tính cả tháng nhuận (6 nhuận 2025), giỗ chỉ theo tháng thường",
       gq.evaluate("[LUNAR.next(15, 0, '2025-07-30'), nextDue('2025-07-10', 'lunar-month', 15), nextDue('2025-08-08', 'lunar-month', 15), LUNAR.next(10, 6, '2025-07-20')]") == ["2025-08-08", "2025-08-08", "2025-09-06", "2026-07-23"])
    gq.fill("#qIn", ""); gq.wait_for_timeout(50)
    gq.context.close()

    # 5) giáo án HLV viết kiểu thường; đồng hồ nghỉ dính đáy; bài phút một lần ghi "Xong"
    gp = page(b, "work"); gp.set_default_timeout(4000)
    PLAN = open(os.path.join(ROOT, "tests", "plan_hlv.txt"), encoding="utf-8").read()
    P = gp.evaluate("t => { const P = parseGymPlan(t, { start: '2026-10-19' }); const bd = P.days.filter(d => d.buoi && !d.rest); gpAssign(bd, new Set(P.days.filter(d => !d.buoi && !d.date).flatMap(d => d.dows)), {}); return P; }", PLAN)
    days = P["days"]; exs = [i for d in days for i in d["items"]]
    bench = next((i for i in exs if i["ex"] == "Bench press"), {})
    ok("2.7 giáo án: 'Bench press: 4 hiệp x 8-10 lần, 40kg' có kg 40, không vào Không hiểu", bench.get("kg") == 40 and bench.get("n") == 4 and bench.get("lo") == 8 and not any("40kg" in x for x in P["skipped"]), str(bench) + str(P["skipped"]))
    ok("2.7 giáo án: '(14kg)' trong ngoặc là mức tạ", any(i["ex"] == "Đẩy tạ đơn dốc lên" and i["kg"] == 14 for i in exs))
    ok("2.7 giáo án: 'Nghỉ: T3, T5, T7, CN' thành ngày nghỉ, không có bài tên CN", not any(i["ex"] in ("CN", "T7", "Nghỉ") for i in exs) and any(d["rest"] and sorted(d["dows"]) == [0, 2, 4, 6] for d in days), str([(d["name"], d["dows"], d["rest"]) for d in days]))
    ok("2.7 giáo án: 'Ngày 1 (Thứ 2)' chọn sẵn thứ trong ngoặc", [d["dows"] for d in days if d["buoi"]] == [[1], [3], [5]], str([d["dows"] for d in days if d["buoi"]]))
    ok("2.7 giáo án: 'nghỉ 60s' sau bài là ghi chú của bài, không thành bài Nghỉ", any(i["ex"] == "Gập bụng" and "nghỉ 60s" in i["note"] for i in exs))
    # kiểm tra 2.7: "mỗi tay 16kg", "16kg mỗi bên" là mức tạ kèm mỗi bên của bài trước, không vào Không hiểu
    P2 = gp.evaluate("t => parseGymPlan(t, { start: '2026-10-19' })", "Thứ 2\n1. Đẩy ngực dốc lên tạ đơn 3x12, mỗi tay 16kg\n2. Lunge 3x10, 8kg mỗi bên\n3. Đẩy vai 3x10 (12kg), nghỉ 90 giây")
    it2 = {i["ex"]: i for d in P2["days"] for i in d["items"]}
    ok("2.7 giáo án: 'mỗi tay 16kg', '8kg mỗi bên' gán kg và mỗi bên cho bài trước",
       it2.get("Đẩy ngực dốc lên tạ đơn", {}).get("kg") == 16 and it2["Đẩy ngực dốc lên tạ đơn"].get("side") is True and it2.get("Lunge", {}).get("kg") == 8 and it2["Lunge"].get("side") is True
       and it2.get("Đẩy vai", {}).get("kg") == 12 and not P2["skipped"], str(it2) + str(P2["skipped"]))
    gp.click("#nav [data-tab=gym]"); gp.wait_for_timeout(200)
    gp.evaluate("gpPasteSheet()"); gp.wait_for_timeout(350)
    gp.fill(".sheet [name=gpsrc]", PLAN); gp.wait_for_timeout(300)
    gp.click(".sheet [data-gpmode=fix]"); gp.wait_for_timeout(150)
    gp.click(".sheet [data-gpsave]"); gp.wait_for_timeout(400)
    plan = gp.evaluate("all('gymplan')[0].data.days.map(d => [d.dows, d.rest, d.items.length])")
    ok("2.7 giáo án: lưu được, các buổi đúng thứ trong ngoặc, ngày nghỉ T3 T5 T7 CN", plan == [[[1], False, 4], [[3], False, 4], [[5], False, 6], [[0, 2, 4, 6], True, 0]], str(plan))
    gp.clock.run_for(5000); gp.wait_for_timeout(100)
    # Chủ nhật 18/10 có buổi 6 bài, có bài 20 phút
    gp.evaluate("""put('gymplan', { name: 'Dài', start: '2026-10-18', until: '', src: '', days: [{ name: 'Toàn thân', dows: [0], date: '', rest: false, items: [
        ...['Hít xà', 'Chống đẩy', 'Squat', 'Lunge', 'Plank', 'Xà kép'].map(ex => ({ ex, n: 4, lo: 10, hi: 0, max: false, unit: 'lần', kg: '', side: false, note: '' })),
        { ex: 'Chạy bộ', n: 1, lo: 20, hi: 0, max: false, unit: 'phút', kg: '', side: false, note: '' }] }] })""")
    gp.evaluate("gymDaySheet('2026-10-18')"); gp.wait_for_timeout(400)
    gp.click(".sheet [data-rest] [data-s='60']"); gp.wait_for_timeout(100)
    gp.evaluate("document.querySelector('.sheet').scrollTop = 0"); gp.wait_for_timeout(50)
    gp.locator(".sheet [data-ga=set][data-r=p0][data-h='0']").click(); gp.wait_for_timeout(300)
    vis = gp.evaluate("(() => { const b = document.querySelector('.sheet [data-restbox]'), r = b.getBoundingClientRect(); return !b.hidden && r.top >= 0 && r.bottom <= innerHeight && r.height > 20; })()")
    ok("2.7 tập: tick hiệp ở bài đầu, đồng hồ nghỉ vẫn thấy trên màn hình (dính đáy sheet)", vis)
    gp.evaluate("document.querySelector('.sheet').scrollTop = 99999"); gp.wait_for_timeout(100)
    vis2 = gp.evaluate("(() => { const b = document.querySelector('.sheet [data-restbox]'), r = b.getBoundingClientRect(); return !b.hidden && r.bottom <= innerHeight + 1; })()")
    ok("2.7 tập: cuộn xuống cuối, đồng hồ vẫn thấy", vis2)
    run_btn = gp.locator(".sheet [data-ga=set][data-r=p6]")
    ok("2.7 tập: bài 20 phút một lần, nút ghi Xong thay cho Hiệp 1", run_btn.count() == 1 and "Xong" in run_btn.inner_text() and "Hiệp" not in run_btn.inner_text(), run_btn.inner_text() if run_btn.count() else "")
    gp.evaluate("closeSheet()"); gp.wait_for_timeout(300)
    gp.click("#nav [data-tab=home]"); gp.wait_for_timeout(200)
    ok("2.7 tập: thẻ Tập trên Hôm nay ghi đơn vị (Hít xà 10 lần)", "Hít xà 10 lần" in gp.inner_text("main"), gp.inner_text("main")[-300:])
    gp.context.close()

    # 6) giao diện: toast 320px, vùng bấm 44px, học sinh, chữ to, việc chưa có hạn, lần lặp sau trên lịch, số tiền lớn
    TAP = """(sel) => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })"""
    for w, scheme in ((320, "light"), (393, "dark")):
        ui_ = page(b, "work", w=w, scheme=scheme); ui_.set_default_timeout(4000)
        ui_.evaluate("toast('Đã bỏ Xong, xóa khoản chi 450k đã tự ghi', { label: 'Hoàn tác', fn: () => {} })"); ui_.wait_for_timeout(300)
        t = ui_.evaluate("(() => { const t = document.querySelector('#toast'), r = t.getBoundingClientRect(), b = t.querySelector('button').getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, right: r.right, bh: b.height, bw: b.width }; })()")
        ok(f"2.7 giao diện {w}: toast rộng theo chữ, không gãy 'Hoàn tác', vùng bấm 44px", t["w"] >= min(w - 40, 280) and t["left"] >= 15 and t["right"] <= w - 15 and t["bh"] >= 44 and t["h"] <= 100, str(t))
        ui_.clock.run_for(6000); ui_.wait_for_timeout(300)
        ui_.evaluate("taskForm(null)"); ui_.wait_for_timeout(350)
        small = [x for x in ui_.evaluate(TAP, ".sheet .pills button, .sheet-h .x") if x[1] < 44 or x[0] < 44]
        ok(f"2.7 giao diện {w}: nút chọn (pills) và nút Đóng cao ít nhất 44px", not small, str(small[:4]))
        ui_.evaluate("closeSheet()"); ui_.wait_for_timeout(300)
        mic = ui_.evaluate(TAP, "main .mic")
        ok(f"2.7 giao diện {w}: nút micro 44px", all(x[0] >= 44 and x[1] >= 44 for x in mic), str(mic))
        ui_.evaluate("docForm(null)"); ui_.wait_for_timeout(350)
        rm = ui_.evaluate(TAP, ".sheet [data-rm], .sheet [data-add]")
        ok(f"2.7 giao diện {w}: nút × bỏ mục giấy tờ và + Thêm mục đủ 44px", rm and all(x[0] >= 44 and x[1] >= 44 for x in rm), str(rm[:3]))
        wide = ui_.evaluate("document.querySelector('.sheet').scrollWidth <= document.querySelector('.sheet').clientWidth + 1")
        ok(f"2.7 giao diện {w}: form giấy tờ không tràn ngang", wide)
        k0 = ui_.evaluate("document.querySelector('.sheet [data-k]').value")
        ui_.click(".sheet [data-rm] >> nth=0"); ui_.wait_for_timeout(100)
        ok(f"2.7 giao diện {w}: bỏ mục giấy tờ có Hoàn tác", "Hoàn tác" in ui_.inner_text("#toast") and ui_.evaluate("document.querySelector('.sheet [data-k]').value") != k0)
        ui_.click("#toast button"); ui_.wait_for_timeout(100)
        ok(f"2.7 giao diện {w}: Hoàn tác trả lại mục giấy tờ đúng chỗ", ui_.evaluate("document.querySelector('.sheet [data-k]').value") == k0)
        ui_.evaluate("closeSheet()"); ui_.wait_for_timeout(300); ui_.clock.run_for(6000)
        # Hôm nay: việc chưa có hạn hiện ngay dưới thẻ việc
        ui_.evaluate("put('task', { title: 'Mua sách tham khảo', type: 'khac', due: '', status: 'todo', subs: [], createdAt: 1 }); put('task', { title: 'Gọi điện cho bác', type: 'khac', due: '', status: 'todo', subs: [], createdAt: 2 }); ui.tab = 'home'; render()")
        ok(f"2.7 Hôm nay {w}: có nhóm Chưa có hạn với việc bấm được", ui_.locator("main [data-nodue]").count() == 1 and ui_.locator("main [data-edit=task]", has_text="Gọi điện cho bác").count() == 1)
        ui_.locator("main [data-edit=task]", has_text="Gọi điện cho bác").locator(".grow").click(); ui_.wait_for_timeout(350)
        ok(f"2.7 Hôm nay {w}: bấm việc chưa có hạn mở form sửa", ui_.locator(".sheet [name=title]").input_value() == "Gọi điện cho bác")
        ui_.evaluate("closeSheet()"); ui_.wait_for_timeout(300)
        # số tiền ≥ 1 tỷ không tràn ngang
        ui_.evaluate("put('tx', { type: 'out', amount: 1234567890, cat: 'khac', note: 'mua nhà', date: '2026-10-18', at: Date.now() }); render()")
        ok(f"2.7 Hôm nay {w}: chi ≥ 1 tỷ không tràn ngang", ui_.evaluate("document.documentElement.scrollWidth") <= w)
        # lịch tháng: lần lặp sau mờ, chỉ xem
        ui_.evaluate("""put('task', { title: 'Tiền phòng', type: 'khac', due: '2026-10-05', status: 'todo', repeat: 'month', amount: 2000000, cat: 'nha', subs: [] });
            put('task', { title: 'Họp nhóm', type: 'khac', due: '2026-10-20', status: 'todo', repeat: 'week', until: '2026-11-10', subs: [] });
            put('task', { title: 'Uống thuốc', type: 'khac', due: '2026-10-18', status: 'todo', repeat: 'day', subs: [] });
            ui.tab = 'cal'; ui.calView = 'month'; ui.calMonth = '2026-11'; ui.calSel = '2026-11-05'; render()""")
        g = ui_.evaluate("""(() => { const cell = d => [...document.querySelectorAll(`[data-mday='${d}'] .ch`)].map(c => c.textContent + (c.classList.contains('ghost') ? '*' : ''));
            return { n5: cell('2026-11-05'), n3: cell('2026-11-03'), n10: cell('2026-11-10'), n17: cell('2026-11-17'), d21: cell('2026-11-21'), dec: cell('2026-12-05') }; })()""")
        ok(f"2.7 lịch {w}: việc lặp hiện lần sau dạng chip mờ, tôn trọng ngày kết thúc, bỏ lặp hằng ngày",
           "Tiền phòng*" in g["n5"] and "Họp nhóm*" in g["n3"] and "Họp nhóm*" in g["n10"] and not g["n17"] and "Uống thuốc*" not in g["d21"] and "Tiền phòng*" in g["dec"], str(g))
        ag = ui_.locator("main .ag.ghost")
        ok(f"2.7 lịch {w}: chương trình ngày có lần lặp sau, không có nút Xong", ag.count() == 1 and "Lần lặp sau" in ag.inner_text() and ag.locator(".check").count() == 0)
        n0 = ui_.evaluate("all('task').length")
        ag.click(); ui_.wait_for_timeout(350)
        ok(f"2.7 lịch {w}: bấm lần lặp sau mở việc gốc, không tạo bản ghi", ui_.locator(".sheet [name=title]").input_value() == "Tiền phòng" and ui_.evaluate("all('task').length") == n0 and ui_.locator(".sheet [name=due]").input_value() == "2026-10-05")
        ui_.evaluate("closeSheet()"); ui_.wait_for_timeout(300)
        ok(f"2.7 lịch {w}: không tràn ngang, không có —", ui_.evaluate("document.documentElement.scrollWidth") <= w and "—" not in ui_.inner_text("main"))
        ui_.context.close()
    # học sinh: form môn học gọn, câu mẫu không có BTL
    hs = page(b, "hs"); hs.set_default_timeout(4000)
    hs.evaluate("classForm(null)"); hs.wait_for_timeout(350)
    ok("2.7 học sinh: form môn học để Mã môn và Tuần học trong Thêm chi tiết", not hs.locator(".sheet [name=code]").is_visible() and not hs.locator(".sheet [name=weeks]").is_visible() and hs.locator(".sheet details.more [name=code]").count() == 1)
    hs.evaluate("closeSheet()"); hs.wait_for_timeout(300)
    for per in ("hs", "work", "biz"):
        hs.evaluate(f"applyPersona('{per}'); ui.tab = 'home'; render(); quickReset('')"); hs.wait_for_timeout(100)
        ok(f"2.7 {per}: câu mẫu ghi nhanh và gợi ý không có BTL", "BTL" not in hs.inner_text("main"), hs.inner_text("#qPrev"))
    for x in hs.evaluate("[...QUICK_EX.work, ...QUICK_EX.biz].map(s => { const q = parseQuick(s, quickOpts()); return [s, q && q.kind]; })"):
        ok(f"2.7 câu mẫu '{x[0]}' hiểu được", x[1] is not None)
    hs.evaluate("applyPersona('sv')"); hs.evaluate("classForm(null)"); hs.wait_for_timeout(350)
    ok("2.7 sinh viên: form môn học vẫn hiện Mã môn", hs.locator(".sheet [name=code]").is_visible())
    hs.evaluate("closeSheet()"); hs.wait_for_timeout(300)
    hs.context.close()
    # chữ to: công tắc ở màn chào, 320px không vỡ
    for w in (320, 393):
        ctx = b.new_context(viewport={"width": w, "height": 860}, timezone_id="Asia/Ho_Chi_Minh")
        ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); ctx.route("**/fonts.*/**", lambda r: r.abort())
        wp = ctx.new_page(); wp.on("pageerror", lambda e: errs.append(f"big {w}: {e}"))
        wp.clock.install(time=datetime.datetime(2026, 10, 18, 13, 5, tzinfo=TZ))
        wp.goto(f"http://127.0.0.1:{PORT}/"); wp.wait_for_timeout(300); wp.clock.run_for(1700); wp.wait_for_timeout(400)
        ok(f"2.7 chữ to {w}: màn chào có công tắc Chữ to", wp.locator(".sheet [data-big]").count() == 1)
        wp.click(".sheet [data-big]"); wp.wait_for_timeout(100)
        ok(f"2.7 chữ to {w}: bật ở màn chào là áp dụng ngay", wp.evaluate("document.documentElement.classList.contains('big') && localStorage.getItem('hn-big') === '1'"))
        wp.click(".sheet [data-pick=persona] [data-v=sv]"); wp.click(".sheet [data-later]"); wp.wait_for_timeout(400)
        wp.evaluate("put('task', { title: 'Nộp báo cáo thực tập cuối kỳ', type: 'bai', due: '2026-10-20', time: '23:59', status: 'todo', amount: 0, subs: [] }); put('class', { title: 'Giải tích 1', days: [1], start: '07:00', end: '09:00', weeks: [] })")
        bad = []
        for tab in ("home", "task", "cal", "money", "gym"):
            wp.evaluate(f"ui.tab = '{tab}'; render()"); wp.wait_for_timeout(80)
            if wp.evaluate("document.documentElement.scrollWidth") > w: bad.append(tab)
        ok(f"2.7 chữ to {w}: không tràn ngang ở mọi tab", not bad, str(bad))
        ok(f"2.7 chữ to {w}: chữ nhỏ nhất (lịch tháng) không dưới 12px", wp.evaluate("parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-xs'))") >= 12)
        ctx.close()


    # 7) đồng bộ: Supabase giả trong trang. Đổi tài khoản thì hỏi; lỗi theo mã; mục quá lớn không chặn cả lô
    FAKE = """(o) => {
      window.__rpc = []; window.__authCb = null; window.__rows = [];
      const q = { select() { return q; }, gt() { return q; }, order() { return q; }, limit() { return Promise.resolve({ data: window.__rows, error: null }); } };
      const fake = { auth: { onAuthStateChange(cb) { window.__authCb = cb; return { data: { subscription: {} } }; }, signOut: async () => ({ error: null }) },
        rpc: async (name, args) => { window.__rpc.push(args.rows.map(r => r.id)); return window.__rpcErr ? window.__rpcErr(args.rows) : { error: null }; },
        from() { window.__from = (window.__from || 0) + 1; return q; }, channel() { window.__ch = (window.__ch || 0) + 1; return { on() { return this; }, subscribe() { return this; } }; }, removeChannel() {} };
      window.supabase = { createClient: () => fake };
      CFG.supabaseUrl = 'https://x.supabase.co'; CFG.supabaseAnonKey = 'k'; sync.sb = null; initSync();
      if (o.owner) localStorage.setItem('hn-owner', JSON.stringify(o.owner));
    }"""
    def login(pg, uid):
        pg.evaluate(f"__authCb('SIGNED_IN', {{ user: {{ id: '{uid}', email: '{uid}@vd.vn' }} }})"); pg.wait_for_timeout(200); pg.clock.run_for(100); pg.wait_for_timeout(200)
    sy = page(b, "sv"); sy.set_default_timeout(4000)
    sy.evaluate("put('task', { title: 'Việc của A', type: 'khac', due: '2026-10-20', status: 'todo', subs: [] }); put('tx', { type: 'out', amount: 30000, cat: 'an', note: 'cơm', date: '2026-10-18', at: 1 })")
    sy.evaluate(FAKE, {"owner": "A"})
    login(sy, "B")
    ok("2.7 đồng bộ: đăng nhập tài khoản khác với lần trước thì hỏi gộp hay bắt đầu trống", sy.locator(".sheet [data-acct=merge]").count() == 1 and sy.locator(".sheet [data-acct=fresh]").count() == 1 and "B@vd.vn" in sy.inner_text(".sheet"))
    sy.clock.run_for(3000); sy.wait_for_timeout(200)
    ok("2.7 đồng bộ: chưa chọn thì không đẩy gì lên", sy.evaluate("__rpc.length") == 0 and sy.evaluate("sync.state") == "hold")
    ok("2.7 đồng bộ: chưa chọn thì cũng không kéo về, không nghe realtime", sy.evaluate("[window.__from || 0, window.__ch || 0]") == [0, 0])
    # Bắt đầu trống mà hủy chia sẻ bản sao lưu: không xóa gì, vẫn chờ chọn
    sy.evaluate("() => { navigator.canShare = () => true; navigator.share = () => Promise.reject(new DOMException('hủy', 'AbortError')); }")
    sy.click(".sheet [data-acct=fresh]"); sy.wait_for_timeout(300)
    ok("2.7 đồng bộ: Bắt đầu trống mà hủy sao lưu thì không xóa dữ liệu, vẫn chờ chọn", sy.evaluate("all('task').length") == 1 and sy.evaluate("sync.hold") == "B" and sy.evaluate("__rpc.length") == 0 and sy.locator(".sheet [data-acct=merge]").count() == 1)
    sy.evaluate("() => { delete navigator.canShare; delete navigator.share; }")
    ok("2.7 đồng bộ: nhãn đồng bộ báo đang chờ chọn, không có —", "chọn gộp" in sy.evaluate("syncLabel()") and "—" not in sy.inner_text(".sheet"))
    sy.click(".sheet [data-acct=merge]"); sy.wait_for_timeout(300); sy.clock.run_for(1000); sy.wait_for_timeout(200)
    ids = sy.evaluate("__rpc.flat()")
    ok("2.7 đồng bộ: Gộp thì đẩy dữ liệu trên máy lên tài khoản mới, nhớ chủ mới", sy.evaluate("all('task').concat(all('tx')).every(r => __rpc.flat().includes(r.id))") and sy.evaluate("JSON.parse(localStorage.getItem('hn-owner'))") == "B", str(len(ids)))
    sy.context.close()
    # Bắt đầu trống: tải bản sao lưu trước, rồi xóa dữ liệu và hàng chờ
    sy = page(b, "sv"); sy.set_default_timeout(4000)
    sy.evaluate("navigator.canShare = undefined; put('task', { title: 'Việc của A', type: 'khac', due: '2026-10-20', status: 'todo', subs: [] })")
    sy.evaluate(FAKE, {"owner": "A"})
    login(sy, "B")
    with sy.expect_download() as dl:
        sy.click(".sheet [data-acct=fresh]")
    sy.wait_for_timeout(300); sy.clock.run_for(1000); sy.wait_for_timeout(200)
    import tempfile as _tf
    pth = os.path.join(_tf.mkdtemp(), "bk.json"); dl.value.save_as(pth)
    bk = _json.load(open(pth, encoding="utf-8"))
    ok("2.7 đồng bộ: Bắt đầu trống tải bản sao lưu có dữ liệu cũ", any(i["data"].get("title") == "Việc của A" for i in bk["items"]))
    ok("2.7 đồng bộ: Bắt đầu trống xóa dữ liệu và hàng chờ trên máy, không đẩy dữ liệu cũ lên", sy.evaluate("all('task').length + Object.keys(queue).length") == 0
       and "Việc của A" not in _json.dumps(sy.evaluate("__rpc")) and sy.evaluate("JSON.parse(localStorage.getItem('hn-owner'))") == "B" and sy.locator(".sheet").count() == 0)
    sy.context.close()
    # lần đầu đăng nhập trên máy: gộp như cũ, không hỏi
    sy = page(b, "sv"); sy.set_default_timeout(4000)
    sy.evaluate("put('task', { title: 'Việc', type: 'khac', due: '', status: 'todo', subs: [] })")
    sy.evaluate(FAKE, {})
    login(sy, "A"); sy.clock.run_for(1000); sy.wait_for_timeout(200)
    ok("2.7 đồng bộ: lần đầu đăng nhập trên máy thì gộp, không hỏi", sy.locator(".sheet [data-acct]").count() == 0 and sy.evaluate("__rpc.length") >= 1)
    # mục quá lớn (23514): đẩy từng dòng, báo đúng mục, các mục khác vẫn lên, lần sau không đẩy lại mục đó
    big = sy.evaluate("put('task', { title: 'Ghi chú khổng lồ', type: 'khac', due: '', status: 'todo', subs: [], note: 'x' }).id")
    sy.evaluate("put('tx', { type: 'out', amount: 5000, cat: 'an', note: 'kẹo', date: '2026-10-18', at: 2 })")
    sy.evaluate(f"""window.__rpcErr = rows => rows.some(r => r.id === '{big}') ? {{ error: {{ code: '23514', message: 'new row for relation "hn_items" violates check constraint "hn_items_data_size"' }} }} : {{ error: null }}; __rpc.length = 0""")
    sy.evaluate("syncNow()"); sy.wait_for_timeout(300)
    st = sy.evaluate("[sync.state, sync.msg, Object.keys(queue)]")
    ok("2.7 đồng bộ: mục quá lớn báo đúng tên, không báo nhầm 'chưa có bảng'", st[0] == "error" and "Ghi chú khổng lồ" in st[1] and "setup.sql" not in st[1] and "quá lớn" in st[1], str(st[:2]))
    ok("2.7 đồng bộ: các mục khác vẫn lên, chỉ mục quá lớn còn trong hàng chờ", st[2] == [big], str(st[2]))
    sy.evaluate("__rpc.length = 0; syncNow()"); sy.wait_for_timeout(300)
    ok("2.7 đồng bộ: lần sau không đẩy lại mục quá lớn chưa sửa", sy.evaluate("__rpc.flat().includes(" + _json.dumps(big) + ")") is False)
    # bấm "Đồng bộ ngay" trong Cài đặt thì thử lại cả mục bị bỏ qua (lỗi có thể chỉ là tạm thời)
    sy.evaluate("window.__rpcErr = null; __rpc.length = 0; settingsSheet()"); sy.wait_for_timeout(350)
    sy.click(".sheet [data-syncnow]"); sy.wait_for_timeout(300)
    ok("2.7 đồng bộ: bấm Đồng bộ ngay thử lại mục từng bị bỏ qua", sy.evaluate(f"__rpc.flat().includes('{big}') && !queue['{big}']") and sy.evaluate("sync.state") == "ok", sy.evaluate("[sync.state, sync.msg]"))
    sy.evaluate("closeSheet()"); sy.wait_for_timeout(300)
    sy.evaluate(f"window.__rpcErr = rows => rows.some(r => r.id === '{big}') ? {{ error: {{ code: '23514', message: 'violates check constraint' }} }} : {{ error: null }}; put('task', {{ ...db['{big}'].data, note: 'y' }}, '{big}'); syncNow()"); sy.wait_for_timeout(300)
    sy.evaluate(f"put('task', {{ ...db['{big}'].data, note: 'ngắn' }}, '{big}'); window.__rpcErr = null; __rpc.length = 0; syncNow()"); sy.wait_for_timeout(300)
    ok("2.7 đồng bộ: sửa mục đó thì đẩy lại được", sy.evaluate(f"!queue['{big}']") and sy.evaluate("sync.state") == "ok")
    # xóa một mục quá lớn: vẫn báo xóa lên được (gửi không kèm nội dung), không kẹt mãi
    big2 = sy.evaluate("put('task', { title: 'Mục to rồi xóa', type: 'khac', due: '', status: 'todo', subs: [], note: 'x' }).id")
    sy.evaluate("window.__rpcErr = rows => rows.some(r => r.data && r.data.note === 'x') ? { error: { code: '23514', message: 'violates check constraint' } } : { error: null }; syncNow()"); sy.wait_for_timeout(300)
    sy.evaluate(f"__rpc.length = 0; window.__rows2 = []; const f = window.__rpcErr; window.__rpcErr = rows => {{ window.__rows2.push(...rows); return f(rows); }}; remove('{big2}'); syncNow()"); sy.wait_for_timeout(400)
    ok("2.7 đồng bộ: xóa mục quá lớn thì vẫn báo xóa lên máy chủ, không kẹt", sy.evaluate(f"!queue['{big2}'] && __rows2.some(r => r.id === '{big2}' && r.deleted && !r.data.note)") and sy.evaluate("sync.state") == "ok", sy.evaluate("[sync.state, sync.msg]"))
    sy.evaluate("window.__rpcErr = null")
    for code, msg, want in (("42P01", 'relation "public.hn_items" does not exist', "setup.sql"), ("PGRST202", "Could not find the function public.hn_push(rows)", "setup.sql"), ("", "Failed to fetch", "Không kết nối được")):
        sy.evaluate(f"put('tx', {{ type: 'out', amount: 1000, cat: 'an', note: 'x', date: '2026-10-18', at: 3 }}); window.__rpcErr = () => ({{ error: {{ code: '{code}', message: '{msg}' }} }}); syncNow()"); sy.wait_for_timeout(300)
        ok(f"2.7 đồng bộ: lỗi {code or msg} báo tiếng Việt đúng ý", want in sy.evaluate("sync.msg"), sy.evaluate("sync.msg"))
    ok("2.7 đồng bộ: lỗi đăng nhập Supabase dịch sang tiếng Việt", sy.evaluate("[viErr('Email not confirmed'), viErr('User already registered'), viErr('Invalid login credentials')]") == ["Email chưa được xác nhận. Mở thư xác nhận trong hộp thư rồi đăng nhập lại.", "Email này đã có tài khoản, hãy bấm Đăng nhập.", "Sai email hoặc mật khẩu"])
    sy.context.close()

    # 8) CSV chặn công thức, CSP chỉ cho đúng file supabase-js, badge thông báo, SHELL, sao lưu đếm giáo án
    cv = page(b, "sv"); cv.set_default_timeout(4000)
    cv.evaluate("navigator.canShare = undefined; put('tx', { type: 'out', amount: 35000, cat: 'an', note: '=HYPERLINK(\"http://x\")', date: '2026-10-18', at: 1 }); put('tx', { type: 'in', amount: 20000, cat: 'thukhac', note: '-bù tiền', date: '2026-10-18', at: 2 })")
    with cv.expect_download() as dl:
        cv.evaluate("exportCsv()")
    pth = os.path.join(_tf.mkdtemp(), "c.csv"); dl.value.save_as(pth); csvt = open(pth, encoding="utf-8-sig").read()
    ok("2.7 CSV: ô chữ bắt đầu bằng = hoặc - thêm dấu ' (Excel không chạy công thức), cột số giữ nguyên",
       "\"'=HYPERLINK(\"\"http://x\"\")\"" in csvt and "\"'-bù tiền\"" in csvt and "\"-35000\"" in csvt and "\"20000\"" in csvt, csvt[:300])
    ok("2.7 CSV: csvQ", cv.evaluate("[csvQ('@a'), csvQ('+1'), csvQ('\\tb'), csvQ(-5), csvQ('bình thường')]") == ['"\'@a"', '"\'+1"', '"\'\tb"', '"-5"', '"bình thường"'])
    cv.evaluate("put('gymplan', { name: 'GA', start: '2026-10-01', until: '', src: '', days: [] }); put('weight', { date: '2026-10-18', kg: 60 }); settingsSheet()"); cv.wait_for_timeout(300)
    ok("2.7 sao lưu: Cài đặt đếm cả giáo án và lần cân", "1 giáo án" in cv.inner_text(".sheet") and "1 lần cân" in cv.inner_text(".sheet"))
    cv.evaluate("closeSheet()"); cv.wait_for_timeout(300); cv.evaluate("icsSheet()"); cv.wait_for_timeout(300)
    ok("2.7 ICS: hướng dẫn nhắc chung Android và iPhone", "Android hoặc iPhone" in cv.inner_text(".sheet .hint"))
    cv.evaluate("closeSheet()"); cv.wait_for_timeout(300)
    # Đã xong: Xem thêm sau 60 việc
    cv.evaluate("batch(() => { for (let i = 0; i < 75; i++) put('task', { title: 'Xong ' + i, type: 'khac', due: '', status: 'done', doneAt: i + 1, subs: [] }); }); ui.tab = 'task'; ui.taskFilter = 'done'; render()")
    n1 = cv.locator("main .row").count()
    cv.click("main [data-act=done-more]"); cv.wait_for_timeout(150)
    ok("2.7 Việc: tab Đã xong có Xem thêm sau 60 việc", n1 == 60 and cv.locator("main .row").count() == 75 and cv.locator("main [data-act=done-more]").count() == 0, f"{n1}")
    csp = cv.evaluate("document.querySelector('meta[http-equiv=Content-Security-Policy]').content")
    ok("2.7 CSP: script-src chỉ cho đúng file supabase-js 2.45.4", f"script-src 'self' {cv.evaluate('SB_SRC')};" in csp and "cdn.jsdelivr.net;" not in csp, csp[:160])
    cv.context.close()
    swt = open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read()
    ok("2.7 sw: badge thông báo là badge-96.png đơn sắc nền trong suốt, có trong SHELL cùng icon-maskable",
       'badge: "badge-96.png"' in swt and '"badge-96.png"' in swt.split("];")[0] and '"icon-maskable-512.png"' in swt.split("];")[0] and os.path.exists(os.path.join(ROOT, "badge-96.png")))
    try:
        from PIL import Image as _Im
        bi = _Im.open(os.path.join(ROOT, "badge-96.png")).convert("RGBA"); px = list(bi.get_flattened_data()) if hasattr(bi, 'get_flattened_data') else list(bi.getdata())
        ok("2.7 sw: badge-96.png chỉ có màu trắng, nền trong suốt", bi.size == (96, 96) and all(p[3] < 10 or (p[0] > 240 and p[1] > 240 and p[2] > 240) for p in px) and sum(1 for p in px if p[3] < 10) > 96 * 96 * 0.2)
    except ImportError:
        pass
    b.close()

# service worker: mở app bằng đường dẫn có tham số (chia sẻ, lối tắt) không tạo mục cache riêng
import shutil as _sh, tempfile as _tf2, http.server as _hs
SITE27 = os.path.join(_tf2.mkdtemp(), "site")
_sh.copytree(ROOT, SITE27, ignore=_sh.ignore_patterns(".git", "tests", "supabase", "*.md", "*.sql"))
with open(os.path.join(SITE27, "config.js"), "w", encoding="utf-8") as f: f.write("window.HN_CONFIG = {};\n")
class Site27(_hs.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=SITE27, **k)
    def log_message(s, *a): pass
s27 = _hs.ThreadingHTTPServer(("127.0.0.1", 0), Site27); threading.Thread(target=s27.serve_forever, daemon=True).start()
B27 = f"http://127.0.0.1:{s27.server_address[1]}/"
with sync_playwright() as p:
    sb = p.chromium.launch(args=["--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:1, MAP fonts.gstatic.com 127.0.0.1:1, MAP cdn.jsdelivr.net 127.0.0.1:1"])
    sctx = sb.new_context(viewport={"width": 393, "height": 860})
    sp = sctx.new_page(); sp.on("pageerror", lambda e: errs.append(f"sw27: {e}"))
    sp.goto(B27); sp.evaluate("localStorage.setItem('hn-onboarded','1')"); sp.evaluate("navigator.serviceWorker.ready.then(() => 1)"); sp.reload(); sp.wait_for_timeout(1200)
    for q in ("?share_text=c%C6%A1m%2035k", "?add=tx", "?share_text=abc&share_title=x"):
        sp.goto(B27 + q); sp.wait_for_timeout(600)
    keys = sp.evaluate("caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys()).then(rs => rs.map(r => r.url))))).then(a => a.flat())")
    ok("2.7 sw: mở bằng ?share_text, ?add không tạo mục cache riêng", keys and not any("?" in k and k.startswith(B27) for k in keys), str([k for k in keys if "?" in k and k.startswith(B27)]))
    ok("2.7 sw: SHELL cài được cả badge-96.png", any(k.endswith("/badge-96.png") for k in keys))
    sctx.set_offline(True); sp.goto(B27 + "?share_text=offline"); sp.wait_for_timeout(800)
    ok("2.7 sw: offline mở bằng đường dẫn có tham số vẫn chạy", sp.evaluate("typeof render === 'function' && document.querySelector('#main').children.length > 0"))
    sctx.close(); sb.close()

# ---------- thông báo: hướng dẫn bật thông báo nổi trên Android (Xiaomi chỉ kêu tiếng, không hiện) ----------
AND_UA = "Mozilla/5.0 (Linux; Android 14; 23078PND5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"
with sync_playwright() as p:
    b = p.chromium.launch()
    for ua, name in ((AND_UA, "Android"), (None, "máy tính")):
        ctx = b.new_context(viewport={"width": 320, "height": 860}, timezone_id="Asia/Ho_Chi_Minh", **({"user_agent": ua} if ua else {}))
        ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); ctx.route("**/fonts.*/**", lambda r: r.abort())
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(f"push hint: {e}"))
        pg.goto(f"http://127.0.0.1:{PORT}/"); pg.evaluate("localStorage.setItem('hn-onboarded','1')"); pg.reload(); pg.wait_for_timeout(400)
        r = pg.evaluate("""async () => { pushState = async () => ({ st: "on" }); const box = document.createElement("div"); document.body.append(box);
          await renderPushCard(box); const h = box.querySelector("[data-pushhint]");
          return { hint: h ? h.textContent : "", test: !!box.querySelector("[data-pushtest]"), over: h ? h.scrollWidth > h.clientWidth + 1 : false }; }""")
        ok(f"push: nút Gửi thử vẫn có ({name})", r["test"])
        if ua:
            ok("push: Android có hướng dẫn bật Thông báo nổi", "Thông báo nổi" in r["hint"] and "Xiaomi" in r["hint"], r["hint"][:80])
            ok("push: hướng dẫn không tràn ở 320px", not r["over"])
            ok("push: hướng dẫn không có gạch ngang dài", "—" not in r["hint"])
        else:
            ok("push: máy không phải Android không hiện hướng dẫn Xiaomi", r["hint"] == "")
        ctx.close()
    b.close()

# ---------- Tiền: lịch chi tiêu theo ngày, sheet ngày để ghi bù khoản quên ghi, chip ngày trong form khoản ----------
MSEED = """() => batch(() => {
  const add = (d, a, cat, note, type = 'out') => put('tx', { type, amount: a, cat, note, date: d, at: Date.now() });
  add('2026-10-01', 45000, 'an', 'phở'); add('2026-10-05', 3500000, 'nha', 'tiền nhà'); add('2026-10-05', 5000000, 'luong', 'lương', 'in');
  add('2026-10-09', 12500000, 'muasam', 'laptop'); add('2026-10-12', 200000, 'giadinh', 'mẹ cho', 'in');
  add('2026-10-14', 60000, 'an', '<img src=x onerror=window.__xss=1>'); add('2026-10-17', 120000, 'an', 'lẩu'); add('2026-10-17', 30000, 'nuoc', 'cà phê');
  add('2026-10-18', 35000, 'an', 'cơm trưa'); add('2026-10-25', 100000, 'quatang', 'quà sinh nhật'); add('2026-09-20', 50000, 'an', 'bún');
})"""
def mrun(name, fn, *a):
    try: fn(*a)
    except Exception as e: ok(f"tiền ngày: {name} chạy hết không lỗi", False, str(e).splitlines()[0][:200])
def mcell(pg, d): return pg.locator(f"#mcal [data-mdate='{d}']")
def m_main(b):
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    pg.evaluate(MSEED); pg.click("#nav [data-tab=money]"); pg.wait_for_timeout(200)
    g = pg.evaluate("""() => { const c = [...document.querySelectorAll('#mcal .mdc')]; const s = document.querySelector('#mcal');
        const sec = s && s.closest('section'), prev = sec && sec.previousElementSibling;
        return { n: c.length, out: c.filter(x => x.classList.contains('out')).length, btn: c.filter(x => x.tagName === 'BUTTON').length,
                 fut: c.filter(x => x.classList.contains('fut')).length, afterTotal: !!(prev && prev.textContent.includes('Đã chi')) }; }""")
    ok("tiền ngày: lưới tháng 10/2026 có 35 ô (5 tuần T2 đến CN), 4 ô ngoài tháng trống, 18 ngày bấm được, 13 ngày tương lai",
       g["n"] == 35 and g["out"] == 4 and g["btn"] == 18 and g["fut"] == 13, str(g))
    ok("tiền ngày: thẻ Lịch chi tiêu nằm ngay dưới thẻ tổng Đã chi", g["afterTotal"])
    ok("tiền ngày: ô 17/10 là tổng chi trong ngày (150k)", mcell(pg, "2026-10-17").locator("small").inner_text() == "150k")
    ok("tiền ngày: ô 05/10 có chi 3,5tr và chấm xanh vì có thu", mcell(pg, "2026-10-05").locator("small").inner_text() == "3,5tr" and mcell(pg, "2026-10-05").locator(".ind").count() == 1)
    ok("tiền ngày: ô chỉ có thu (12/10) hiện số thu màu xanh", mcell(pg, "2026-10-12").locator("small.in").inner_text() == "200k")
    ok("tiền ngày: số lớn gọn cho ô hẹp (12,5tr thành 13tr)", mcell(pg, "2026-10-09").locator("small").inner_text() == "13tr")
    c15 = mcell(pg, "2026-10-15")
    ok("tiền ngày: ngày chưa ghi khoản nào hiện trống (viền đứt), nhãn đọc màn hình nói rõ",
       "empty" in c15.get_attribute("class") and "chưa ghi khoản nào" in c15.get_attribute("aria-label") and c15.locator("small").inner_text().strip() == "")
    ok("tiền ngày: hôm nay có vòng và aria-current=date", "today" in mcell(pg, "2026-10-18").get_attribute("class") and mcell(pg, "2026-10-18").get_attribute("aria-current") == "date")
    hint = pg.locator("main .mcal-hint").inner_text()
    ok("tiền ngày: dòng nhắc đếm ngày đã qua chưa ghi (11 ngày)", "11 ngày chưa ghi khoản nào" in hint, hint)
    fut = pg.locator("#mcal .mdc.fut").filter(has_text="25")
    ok("tiền ngày: ngày tương lai mờ, không phải nút, không có data-act", fut.count() == 1 and pg.evaluate("[...document.querySelectorAll('#mcal .mdc.fut')].every(x => x.tagName !== 'BUTTON' && !x.hasAttribute('data-act') && !x.hasAttribute('data-mdate'))")
       and float(pg.evaluate("getComputedStyle(document.querySelector('#mcal .mdc.fut')).opacity")) < 0.6)
    fut.click(); pg.wait_for_timeout(300)
    ok("tiền ngày: bấm ngày tương lai không mở gì", pg.locator(".sheet").count() == 0)
    hs = pg.evaluate("Math.min(...[...document.querySelectorAll('#mcal button.mdc')].map(x => x.getBoundingClientRect().height))")
    ok("tiền ngày: ô ngày cao ít nhất 44px", hs >= 44, f"{hs}px")
    ok("tiền ngày: lưới và danh sách không chạy mã trong ghi chú (XSS)", pg.evaluate("window.__xss") is None and pg.locator("main img[src=x]").count() == 0)
    # thu gọn / mở thẻ, nhớ trên máy
    pg.click("main [data-act=money-cal]"); pg.wait_for_timeout(150)
    ok("tiền ngày: Thu gọn ẩn lưới, vẫn còn dòng nhắc, nhớ trên máy", pg.locator("#mcal").count() == 0 and pg.locator("main .mcal-hint").count() == 1 and pg.evaluate("localStorage.getItem('hn-moneyCalOff')") == "1")
    pg.click("main [data-act=money-cal]"); pg.wait_for_timeout(150)
    ok("tiền ngày: Mở lịch hiện lại lưới", pg.locator("#mcal").count() == 1)

    # sheet ngày từ ô lịch: ngày trống, gõ nhanh hai khoản, Hoàn tác
    c15.click(); pg.wait_for_timeout(400)
    ok("tiền ngày: bấm ô 15/10 mở sheet ngày, tiêu đề có thứ và ngày", pg.locator(".sheet h3").inner_text() == "Thứ Năm, 15/10", pg.locator(".sheet h3").inner_text())
    ok("tiền ngày: ngày trống có lời nhắc ghi bù", "Ngày này chưa ghi khoản nào. Quên ghi thì thêm ở đây." in pg.locator(".sheet").inner_text())
    pg.fill(".sheet [name=mdq]", "cơm 35k + nước 10k"); pg.wait_for_timeout(100)
    prev = pg.locator(".sheet .mdq-it")
    ok("tiền ngày: xem trước hai khoản khi gõ, không kèm ngày khác", prev.count() == 2 and "35.000đ" in prev.nth(0).inner_text() and "hôm" not in pg.locator(".sheet [data-mdq-prev]").inner_text())
    pg.press(".sheet [name=mdq]", "Enter"); pg.wait_for_timeout(200)
    got = pg.evaluate("all('tx').filter(r => r.data.date === '2026-10-15').map(r => r.data.amount).sort((a, b) => a - b)")
    ok("tiền ngày: Enter ghi hai khoản đúng ngày 15/10", got == [10000, 35000], str(got))
    ok("tiền ngày: sheet vẽ lại ngay, có hai khoản, ô gõ trống và vẫn đang gõ được",
       pg.locator(".sheet .mdl .row").count() == 2 and pg.input_value(".sheet [name=mdq]") == "" and pg.evaluate("document.activeElement && document.activeElement.name") == "mdq")
    ok("tiền ngày: ô 15/10 trên lưới cập nhật tổng 45k", mcell(pg, "2026-10-15").locator("small").inner_text() == "45k")
    ok("tiền ngày: toast có Hoàn tác", "Hoàn tác" in pg.locator("#toast").inner_text())
    pg.click("#toast button"); pg.wait_for_timeout(200)
    ok("tiền ngày: Hoàn tác xóa cả hai khoản, sheet về trạng thái trống",
       pg.evaluate("all('tx').filter(r => r.data.date === '2026-10-15').length") == 0 and pg.locator(".sheet .mdl-empty").count() == 1)
    pg.clock.run_for(5000); pg.wait_for_timeout(100)
    tasks0 = pg.evaluate("all('task').length")
    pg.fill(".sheet [name=mdq]", "nộp BTL thứ 6"); pg.wait_for_timeout(100)
    ok("tiền ngày: câu không phải thu chi thì báo nhẹ", "Chỉ ghi thu chi ở đây" in pg.locator(".sheet [data-mdq-prev]").inner_text())
    pg.press(".sheet [name=mdq]", "Enter"); pg.wait_for_timeout(150)
    ok("tiền ngày: không tạo việc từ sheet ngày", pg.evaluate("all('task').length") == tasks0 and pg.evaluate("all('tx').filter(r => r.data.date === '2026-10-15').length") == 0)
    pg.fill(".sheet [name=mdq]", "<img src=x onerror=window.__xss=1> 10k"); pg.wait_for_timeout(100)
    ok("tiền ngày: xem trước không chạy mã (XSS)", pg.evaluate("window.__xss") is None and pg.locator(".sheet img").count() == 0)
    pg.fill(".sheet [name=mdq]", ""); pg.wait_for_timeout(50)
    sz = pg.evaluate("""() => [...document.querySelectorAll('.sheet [data-mdq-save], .sheet [data-add]')].map(x => Math.round(x.getBoundingClientRect().height))""")
    ok("tiền ngày: nút Ghi, + Ghi chi, + Ghi thu cao ít nhất 44px", len(sz) == 3 and min(sz) >= 44, str(sz))

    # + Ghi chi: form khoản đặt sẵn ngày, lưu xong quay lại sheet ngày
    pg.click(".sheet [data-add=out]"); pg.wait_for_timeout(400)
    ok("tiền ngày: + Ghi chi mở form với tiêu đề Ghi khoản cho Thứ Năm, 15/10", pg.locator(".sheet h3").inner_text() == "Ghi khoản cho Thứ Năm, 15/10", pg.locator(".sheet h3").inner_text())
    ok("tiền ngày: form đặt sẵn ngày 15/10, chip Ngày khác đang chọn, ô ngày hiện",
       pg.input_value(".sheet [name=date]") == "2026-10-15" and pg.locator(".sheet [data-pick=date] button.on").get_attribute("data-v") == "x" and pg.locator(".sheet [name=date]").is_visible())
    pg.fill(".sheet [name=amount]", "50"); pg.fill(".sheet [name=note]", "bánh mì"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(400)
    ok("tiền ngày: lưu khoản ngày 15/10", pg.evaluate("all('tx').some(r => r.data.date === '2026-10-15' && r.data.amount === 50000 && r.data.note === 'bánh mì')"))
    ok("tiền ngày: lưu xong mở lại sheet ngày 15/10 có khoản mới", pg.locator(".sheet h3").inner_text() == "Thứ Năm, 15/10" and "bánh mì" in pg.locator(".sheet .mdl").inner_text())
    ok("tiền ngày: toast khoản mới có Hoàn tác", "Hoàn tác" in pg.locator("#toast").inner_text())
    pg.click("#toast button"); pg.wait_for_timeout(200)
    ok("tiền ngày: Hoàn tác khoản ghi từ form, sheet ngày vẽ lại", pg.evaluate("all('tx').filter(r => r.data.date === '2026-10-15').length") == 0 and pg.locator(".sheet .mdl-empty").count() == 1)
    pg.clock.run_for(5000); pg.wait_for_timeout(100)
    pg.click(".sheet [data-add=in]"); pg.wait_for_timeout(400)
    ok("tiền ngày: + Ghi thu mở form Thu vào với danh mục thu", pg.locator(".sheet [data-pick=type] button.on").get_attribute("data-v") == "in" and pg.locator(".sheet .catgrid [data-v=giadinh].on").count() == 1)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)

    # nút + ở tiêu đề nhóm ngày trong danh sách khoản
    add17 = pg.locator("main .mgh-add[data-mdate='2026-10-17']")
    bb = add17.bounding_box()
    ok("tiền ngày: tiêu đề nhóm ngày có nút + 44px, nhãn Thêm khoản cho Thứ Bảy 17/10",
       add17.get_attribute("aria-label") == "Thêm khoản cho Thứ Bảy 17/10" and bb["width"] >= 44 and bb["height"] >= 44, f"{bb}")
    add17.click(); pg.wait_for_timeout(400)
    ok("tiền ngày: nút + mở sheet ngày 17/10 (nói rõ hôm qua), đủ hai khoản và tổng chi",
       pg.locator(".sheet h3").inner_text() == "Thứ Bảy, 17/10 · hôm qua" and pg.locator(".sheet .mdl .row").count() == 2 and "150.000đ" in pg.locator(".sheet .mds").inner_text())
    # sửa khoản từ sheet ngày: đổi sang Hôm kia
    pg.locator(".sheet .mdl .row", has_text="lẩu").click(); pg.wait_for_timeout(400)
    ok("tiền ngày: bấm khoản trong sheet mở form Sửa khoản, chip Hôm qua đang chọn", pg.locator(".sheet h3").inner_text() == "Sửa khoản" and pg.locator(".sheet [data-pick=date] button.on").get_attribute("data-v") == "1")
    pg.click(".sheet [data-pick=date] [data-v='2']"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(400)
    ok("tiền ngày: sửa khoản đổi sang hôm kia (16/10), sheet ngày 16/10 mở lại có khoản đó",
       pg.evaluate("all('tx').find(r => r.data.note === 'lẩu').data.date") == "2026-10-16" and pg.locator(".sheet h3").inner_text().startswith("Thứ Sáu, 16/10") and "lẩu" in pg.locator(".sheet .mdl").inner_text())
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    # sửa khoản cũ từ danh sách: đổi ngày bằng ô Ngày khác
    pg.locator("main [data-edit=tx]", has_text="phở").click(); pg.wait_for_timeout(400)
    ok("tiền ngày: sửa khoản cũ (01/10) thì chip Ngày khác chọn sẵn, ô ngày hiện", pg.locator(".sheet [data-pick=date] button.on").get_attribute("data-v") == "x" and pg.locator(".sheet [name=date]").is_visible())
    pg.fill(".sheet [name=date]", "2026-10-03"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(400)
    ok("tiền ngày: sửa khoản cũ đổi được ngày", pg.evaluate("all('tx').find(r => r.data.note === 'phở').data.date") == "2026-10-03" and pg.locator(".sheet").count() == 0)
    ok("tiền ngày: sheet ngày 14/10 không chạy mã trong ghi chú (XSS)", (mcell(pg, "2026-10-14").click(), pg.wait_for_timeout(400), pg.evaluate("window.__xss") is None and pg.locator(".sheet img").count() == 0 and "<img" in pg.locator(".sheet .mdl").inner_text())[-1])
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)

    # chip Hôm qua / Hôm kia trong form khoản mới
    pg.click("#fab"); pg.wait_for_timeout(400)
    ok("tiền ngày: form khoản mới tiêu đề Ghi khoản mới, chip Hôm nay", pg.locator(".sheet h3").inner_text() == "Ghi khoản mới" and pg.locator(".sheet [data-pick=date] button.on").get_attribute("data-v") == "0")
    ch = pg.evaluate("Math.min(...[...document.querySelectorAll('.sheet [data-pick=date] button')].map(x => x.getBoundingClientRect().height))")
    ok("tiền ngày: chip ngày cao ít nhất 44px", ch >= 44, f"{ch}px")
    pg.click(".sheet [data-pick=date] [data-v='1']")
    ok("tiền ngày: chip Hôm qua đặt ngày 17/10, ô ngày ẩn", pg.input_value(".sheet [name=date]") == "2026-10-17" and not pg.locator(".sheet [name=date]").is_visible())
    pg.fill(".sheet [name=amount]", "20"); pg.fill(".sheet [name=note]", "gửi xe hôm qua"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(400)
    ok("tiền ngày: lưu bằng chip Hôm qua ghi ngày 17/10", pg.evaluate("all('tx').find(r => r.data.note === 'gửi xe hôm qua').data.date") == "2026-10-17")
    pg.click("#fab"); pg.wait_for_timeout(400)
    pg.click(".sheet [data-pick=date] [data-v='2']"); pg.fill(".sheet [name=amount]", "15"); pg.fill(".sheet [name=note]", "nước hôm kia"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(400)
    ok("tiền ngày: lưu bằng chip Hôm kia ghi ngày 16/10", pg.evaluate("all('tx').find(r => r.data.note === 'nước hôm kia').data.date") == "2026-10-16")
    pg.click("#fab"); pg.wait_for_timeout(400)
    pg.click(".sheet [data-pick=date] [data-v=x]"); pg.wait_for_timeout(100)
    ok("tiền ngày: chip Ngày khác hiện ô chọn ngày", pg.locator(".sheet [name=date]").is_visible())
    pg.fill(".sheet [name=date]", "2026-10-17"); pg.dispatch_event(".sheet [name=date]", "change")
    ok("tiền ngày: chọn ngày trùng hôm qua thì chip Hôm qua sáng lên", pg.locator(".sheet [data-pick=date] button.on").get_attribute("data-v") == "1")
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)

    # tháng trước: lưới tháng 9, ghi bù cho một ngày trong tháng đó
    pg.click("main [data-month='-1']"); pg.wait_for_timeout(200)
    ok("tiền ngày: tháng 9 có lưới 30 ngày đều bấm được, ô 20/09 là 50k",
       pg.locator("#mcal button.mdc").count() == 30 and mcell(pg, "2026-09-20").locator("small").inner_text() == "50k" and pg.locator("#mcal .mdc.today").count() == 0)
    mcell(pg, "2026-09-10").click(); pg.wait_for_timeout(400)
    ok("tiền ngày: sheet ngày 10/09", pg.locator(".sheet h3").inner_text() == "Thứ Năm, 10/09", pg.locator(".sheet h3").inner_text())
    pg.fill(".sheet [name=mdq]", "phở 40k"); pg.click(".sheet [data-mdq-save]"); pg.wait_for_timeout(200)
    ok("tiền ngày: ghi nhanh cho 10/09, vẫn xem tháng 9, ô cập nhật",
       pg.evaluate("all('tx').some(r => r.data.date === '2026-09-10' && r.data.amount === 40000)") and pg.evaluate("ui.month") == "2026-09" and mcell(pg, "2026-09-10").locator("small").inner_text() == "40k")
    pg.clock.run_for(5000); pg.wait_for_timeout(100)
    pg.click(".sheet [data-add=out]"); pg.wait_for_timeout(400)
    pg.fill(".sheet [name=amount]", "25"); pg.click(".sheet [data-save]"); pg.wait_for_timeout(400)
    ok("tiền ngày: + Ghi chi cho 10/09 lưu đúng ngày, quay lại sheet 10/09",
       pg.evaluate("all('tx').filter(r => r.data.date === '2026-09-10').length") == 2 and pg.locator(".sheet h3").inner_text() == "Thứ Năm, 10/09" and pg.locator(".sheet .mdl .row").count() == 2)
    # xóa từ sheet ngày: quay lại sheet, Hoàn tác trả lại
    pg.locator(".sheet .mdl .row", has_text="phở").click(); pg.wait_for_timeout(400)
    pg.click(".sheet [data-del]"); pg.wait_for_timeout(400)
    ok("tiền ngày: xóa khoản từ sheet ngày quay lại sheet ngày, còn một khoản", pg.locator(".sheet h3").inner_text() == "Thứ Năm, 10/09" and pg.locator(".sheet .mdl .row").count() == 1)
    pg.click("#toast button"); pg.wait_for_timeout(200)
    ok("tiền ngày: Hoàn tác xóa trả lại khoản, sheet vẽ lại", pg.locator(".sheet .mdl .row").count() == 2)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    pg.context.close()
def m_narrow(b, w, scheme, big):
    pg = page(b, "sv", w=w, scheme=scheme, init="localStorage.setItem('hn-big','1')" if big else None); pg.set_default_timeout(4000)
    tag = f"{w}px {scheme}{' chữ to' if big else ''}"
    pg.evaluate(MSEED); pg.click("#nav [data-tab=money]"); pg.wait_for_timeout(200)
    r = pg.evaluate("""() => ({ over: document.documentElement.scrollWidth - innerWidth,
        clip: [...document.querySelectorAll('#mcal small')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent),
        minH: Math.min(...[...document.querySelectorAll('#mcal button.mdc')].map(x => x.getBoundingClientRect().height)) })""")
    ok(f"tiền ngày {tag}: tab Tiền không tràn ngang, số trong ô không bị cắt, ô cao >= 44px", r["over"] <= 0 and not r["clip"] and r["minH"] >= 44, str(r))
    mcell(pg, "2026-10-17").click(); pg.wait_for_timeout(400)
    pg.fill(".sheet [name=mdq]", "cơm 35k + nước 10k"); pg.wait_for_timeout(100)
    r = pg.evaluate("() => { const s = document.querySelector('.sheet'); return { over: s.scrollWidth - s.clientWidth, page: document.documentElement.scrollWidth - innerWidth }; }")
    ok(f"tiền ngày {tag}: sheet ngày không tràn ngang", r["over"] <= 0 and r["page"] <= 0, str(r))
    pg.click(".sheet [data-add=out]"); pg.wait_for_timeout(400)
    r = pg.evaluate("""() => { const g = document.querySelector('.sheet [data-pick=date]'), s = document.querySelector('.sheet');
        return { over: s.scrollWidth - s.clientWidth, seg: g.scrollWidth - g.clientWidth, minH: Math.min(...[...g.querySelectorAll('button')].map(x => x.getBoundingClientRect().height)) }; }""")
    ok(f"tiền ngày {tag}: chip ngày vừa khung, cao >= 44px", r["over"] <= 0 and r["seg"] <= 0 and r["minH"] >= 44, str(r))
    pg.context.close()
with sync_playwright() as p:
    b = p.chromium.launch()
    mrun("luồng chính", m_main, b)
    for w, scheme, big in ((320, "light", False), (320, "dark", True), (393, "dark", False)):
        mrun(f"{w}px {scheme}", m_narrow, b, w, scheme, big)
    b.close()

# ---------- 2.8 A: sổ nợ, chia tiền nhóm ----------
def run28(name, fn, *a):
    try: fn(*a)
    except Exception as e: ok(f"2.8 {name}: chạy hết không lỗi", False, str(e).splitlines()[0][:200])
XSS = "<img src=x onerror=window.__xss=1>"
def d_main(b):
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    out0 = pg.evaluate("sumOut(monthTx('2026-10'))")
    # ghi nhanh: mượn, cho mượn không phải thu chi
    for s in ("mượn bạn Nam 200k", "cho Lan mượn 100k thứ 6", "vay mẹ 2tr 25/10"):
        pg.evaluate(f"quickReset({s!r})"); pg.evaluate("quickSave()")
    ok("2.8 nợ: ghi nhanh mượn, cho mượn thành 3 khoản nợ, không có khoản thu chi nào",
       pg.evaluate("all('debt').length") == 3 and pg.evaluate("all('tx').length") == 0, str(pg.evaluate("all('debt').map(r => r.data)")))
    ok("2.8 nợ: 'cho Lan mượn 100k thứ 6' có hẹn trả 23/10, 'vay mẹ 2tr 25/10' hẹn trả 25/10",
       pg.evaluate("[all('debt').find(r => r.data.who === 'Lan').data.due, all('debt').find(r => r.data.who === 'mẹ').data.due]") == ["2026-10-23", "2026-10-25"])
    ok("2.8 nợ: mượn tiền không ăn vào chi tiêu tháng và ngân sách", pg.evaluate("sumOut(monthTx('2026-10'))") == out0 == 0)
    # chia tiền: phần của mình là khoản chi, phần người khác là khoản nợ cùng group
    pg.evaluate("quickReset('lẩu 600k chia 4')"); pg.evaluate("quickSave()")
    r = pg.evaluate("""() => { const tx = all('tx'), d = all('debt').filter(x => x.data.group);
        return { tx: tx.map(x => [x.data.type, x.data.amount, x.data.note, x.data.cat]), d: d.map(x => [x.data.who, x.data.amount, x.data.dir]), same: tx.length === 1 && d.every(x => x.data.group === tx[0].data.group) }; }""")
    ok("2.8 chia tiền: 'lẩu 600k chia 4' = chi 150k (Ăn uống) + 3 người nợ 450k, cùng group",
       r["tx"] == [["out", 150000, "lẩu", "an"]] and r["d"] == [["3 người", 450000, "lend"]] and r["same"], str(r))
    ok("2.8 chia tiền: chi tiêu tháng chỉ tăng đúng phần của mình", pg.evaluate("sumOut(monthTx('2026-10'))") == 150000)
    pg.evaluate("quickReset('pizza 300k chia 3 với Nam Lan')"); pg.evaluate("quickSave()")
    ok("2.8 chia tiền: gõ tên thì mỗi người một khoản 100k", pg.evaluate("all('debt').filter(r => r.data.note === 'pizza').map(r => [r.data.who, r.data.amount]).sort()") == [["Lan", 100000], ["Nam", 100000]])
    # thẻ Sổ nợ
    pg.click("#nav [data-tab=money]"); pg.wait_for_timeout(200)
    card = pg.locator("main [data-debtcard]")
    t = card.inner_text()
    ok("2.8 nợ: thẻ Sổ nợ có tổng mình nợ 2,2tr và người ta nợ mình 750k", "2.200.000đ" in t and "750.000đ" in t, t[:300])
    ok("2.8 nợ: thẻ Sổ nợ gộp theo người (Nam: mượn 200k và nợ pizza 100k ở cùng một dòng)", card.locator("[data-act=debt-person][data-k=nam]").count() == 1)
    ok("2.8 nợ: Sắp phải trả có khoản mình nợ mẹ hẹn 25/10", "Trả mẹ" in pg.locator("main section", has_text="Sắp phải trả").inner_text())
    # sheet một người: chép lời nhắc, trả một phần, đã trả, hoàn tác
    card.locator("[data-k='3 nguoi']").click(); pg.wait_for_timeout(400)
    ok("2.8 nợ: lời nhắc cho khoản chia tiền chưa ghi tên là phần của mỗi người",
       pg.locator(".sheet [data-nudge]").inner_text() == "Nhắc nhẹ: bạn còn nợ mình 150k tiền lẩu 18/10 nha", pg.locator(".sheet [data-nudge]").inner_text())
    pg.evaluate("window.__clip = ''; navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }")
    pg.click(".sheet [data-da=nudge]"); pg.wait_for_timeout(100)
    ok("2.8 nợ: Chép lời nhắc chép đúng câu", pg.evaluate("window.__clip") == "Nhắc nhẹ: bạn còn nợ mình 150k tiền lẩu 18/10 nha")
    pg.click(".sheet [data-da=part]"); pg.fill(".sheet [data-partv]", "150k"); pg.click(".sheet [data-da=partok]"); pg.wait_for_timeout(200)
    ok("2.8 nợ: trả một phần 150k thì còn 300k, ghi ngày trả", pg.evaluate("(() => { const d = all('debt').find(r => r.data.who === '3 người').data; return [d.paid, debtLeft(d), d.paidAt]; })()") == [150000, 300000, "2026-10-18"])
    ok("2.8 nợ: trả nợ không ghi khoản thu", pg.evaluate("all('tx').filter(r => r.data.type === 'in').length") == 0)
    pg.click(".sheet [data-da=pay]"); pg.wait_for_timeout(200)
    ok("2.8 nợ: Đã trả thì hết nợ, khoản chuyển xuống Đã trả", pg.evaluate("debtLeft(all('debt').find(r => r.data.who === '3 người').data)") == 0 and pg.locator(".sheet .dit.done").count() == 1)
    pg.click("#toast button"); pg.wait_for_timeout(200)
    ok("2.8 nợ: Hoàn tác trả lại số còn nợ 300k", pg.evaluate("debtLeft(all('debt').find(r => r.data.who === '3 người').data)") == 300000 and pg.locator(".sheet .dit:not(.done)").count() == 1)
    sz = pg.evaluate("[...document.querySelectorAll('.sheet .dit-a .btn, .sheet [data-da=nudge], .sheet [data-da=add]')].map(x => Math.round(x.getBoundingClientRect().height))")
    ok("2.8 nợ: nút trong sheet một người cao ít nhất 44px", sz and min(sz) >= 44, str(sz))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    # ghi nhanh trả nợ khi có khoản cùng người
    pg.click("#nav [data-tab=home]"); pg.wait_for_timeout(200)
    pg.evaluate("quickReset('Nam trả 200k')")
    ok("2.8 nợ: 'Nam trả 200k' xem trước là trả nợ", "Nam trả nợ 200k" in pg.evaluate("quickList()[0].text"), pg.evaluate("quickList()[0].text"))
    pg.evaluate("quickSave()")
    ok("2.8 nợ: 'Nam trả 200k' trả khoản cũ trước (mượn 200k của Nam không đụng, Nam nợ pizza 100k)",
       pg.evaluate("all('debt').filter(r => debtKey(r.data.who) === 'nam').map(r => [r.data.dir, r.data.amount, r.data.paid || 0]).sort()") == [["lend", 100000, 100000], ["owe", 200000, 0]],
       str(pg.evaluate("all('debt').filter(r => debtKey(r.data.who) === 'nam').map(r => r.data)")))
    pg.evaluate("quickReset('trả Nam 200k')"); pg.evaluate("quickSave()")
    ok("2.8 nợ: 'trả Nam 200k' trả khoản mình mượn Nam", pg.evaluate("debtLeft(all('debt').find(r => r.data.dir === 'owe' && r.data.who === 'Nam').data)") == 0)
    ok("2.8 nợ: trả nợ bằng ghi nhanh không sinh khoản thu chi", pg.evaluate("all('tx').length") == 2)
    pg.click("#toast button"); pg.wait_for_timeout(200)
    ok("2.8 nợ: Hoàn tác ghi nhanh trả nợ", pg.evaluate("debtLeft(all('debt').find(r => r.data.dir === 'owe' && r.data.who === 'Nam').data)") == 200000)
    # lịch tháng: khoản có hẹn trả
    pg.click("#nav [data-tab=cal]"); pg.wait_for_timeout(200)
    pg.click("[data-mday='2026-10-23']"); pg.wait_for_timeout(200)
    ag = pg.locator("main .ag", has_text="Lan hẹn trả")
    ok("2.8 nợ: lịch tháng có 'Lan hẹn trả' ngày 23/10, nhãn Thu nợ", ag.count() == 1 and "Thu nợ" in ag.inner_text())
    ag.click(); pg.wait_for_timeout(400)
    ok("2.8 nợ: bấm mở sổ nợ của Lan", pg.locator(".sheet h3").inner_text() == "Lan")
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    # tìm kiếm
    pg.click("[data-act=search]"); pg.wait_for_timeout(300); pg.fill(".sheet [name=q]", "pizza"); pg.wait_for_timeout(150)
    ok("2.8 nợ: tìm 'pizza' ra nhóm Sổ nợ", "Sổ nợ" in pg.locator(".sheet [data-res]").inner_text())
    pg.locator(".sheet [data-k=debt]").first.click(); pg.wait_for_timeout(400)
    ok("2.8 nợ: bấm kết quả mở sheet người đó", pg.locator(".sheet h3").inner_text() in ("Nam", "Lan"))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    # form ghi nợ và XSS ở tên, ghi chú
    pg.click("#nav [data-tab=money]"); pg.wait_for_timeout(200)
    pg.click("main [data-act=debt-add]"); pg.wait_for_timeout(400)
    pg.click(".sheet [data-pick=dir] [data-v=lend]"); pg.fill(".sheet [name=who]", XSS); pg.fill(".sheet [name=amount]", "50k"); pg.fill(".sheet [name=note]", XSS)
    pg.click(".sheet [data-save]"); pg.wait_for_timeout(300)
    ok("2.8 nợ: form Ghi nợ lưu đúng chiều và số tiền", pg.evaluate(f"(() => {{ const r = all('debt').find(r => r.data.who === {XSS!r}); return r && [r.data.dir, r.data.amount, r.data.note]; }})()") == ["lend", 50000, XSS])
    pg.locator("main [data-act=debt-person]", has_text="img src").click(); pg.wait_for_timeout(400)
    ok("2.8 nợ: tên và ghi chú có thẻ HTML không chạy (XSS) ở thẻ và sheet", pg.evaluate("window.__xss") is None and pg.locator("main img, .sheet img").count() == 0)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    # chia tiền bằng form, người khác trả
    pg.click("main [data-act=split]"); pg.wait_for_timeout(400)
    pg.fill(".sheet [name=total]", "300k"); pg.fill(".sheet [name=note]", "karaoke"); pg.click(".sheet [data-pick=payer] [data-v=other]"); pg.fill(".sheet [name=payer]", "Hùng")
    pg.click(".sheet [data-n='1']"); pg.wait_for_timeout(100)
    ok("2.8 chia tiền: form xem trước mỗi người 100k, bạn nợ Hùng 100k", "Bạn nợ Hùng 100k" in pg.locator(".sheet [data-splitprev]").inner_text(), pg.locator(".sheet [data-splitprev]").inner_text())
    pg.click(".sheet [data-save]"); pg.wait_for_timeout(300)
    ok("2.8 chia tiền: người khác trả thì ghi chi phần mình và mình nợ Hùng",
       pg.evaluate("[all('tx').some(r => r.data.note === 'karaoke' && r.data.amount === 100000), all('debt').some(r => r.data.who === 'Hùng' && r.data.dir === 'owe' && r.data.amount === 100000)]") == [True, True])
    # sao lưu có khoản nợ, CSV riêng
    pg.evaluate("navigator.canShare = undefined")
    with pg.expect_download() as dl: pg.evaluate("exportData()")
    import json, tempfile
    path = os.path.join(tempfile.mkdtemp(), "b.json"); dl.value.save_as(path)
    with open(path, encoding="utf-8") as f: bk = json.load(f)
    ok("2.8 nợ: bản sao lưu có các khoản nợ", sum(1 for i in bk["items"] if i["kind"] == "debt") == pg.evaluate("all('debt').length"))
    with pg.expect_download() as dl: pg.evaluate("exportDebtCsv()")
    path = os.path.join(tempfile.mkdtemp(), "n.csv"); dl.value.save_as(path)
    csv = open(path, encoding="utf-8-sig").read()
    ok("2.8 nợ: CSV sổ nợ có tiêu đề và ô chữ bắt đầu bằng < giữ nguyên, ô = được chặn", csv.startswith('"Ngày","Người","Chiều"') and "karaoke" in csv, csv[:200])
    pg.evaluate("put('debt', { who: '=1+1', amount: 1000, dir: 'owe', date: '2026-10-18', due: '', note: '', paid: 0, paidAt: '', group: '' })")
    with pg.expect_download() as dl: pg.evaluate("exportDebtCsv()")
    path = os.path.join(tempfile.mkdtemp(), "n2.csv"); dl.value.save_as(path)
    ok("2.8 nợ: CSV sổ nợ chặn công thức", "\"'=1+1\"" in open(path, encoding="utf-8-sig").read())
    # dữ liệu rác (máy khác, file sao lưu) không làm hỏng màn hình
    pg.evaluate("""() => { const id = crypto.randomUUID(); db[id] = { id, kind: 'debt', data: normalize('debt', { who: 123, amount: 'abc', dir: 'x', date: '2026-02-31', due: 5, paid: -3, group: '<b>' }), deleted: false, updated_at: new Date().toISOString() }; render(); }""")
    d = pg.evaluate("all('debt').find(r => r.data.who === '123').data")
    ok("2.8 nợ: NORM sửa trường sai kiểu (tên số, tiền chữ, chiều lạ, ngày không có thật, đã trả âm, group lạ)",
       d["amount"] == 0 and d["dir"] == "owe" and d["date"] == "2026-02-28" and d["due"] == "" and d["paid"] == 0 and d["group"] == "", str(d))
    ok("2.8 nợ: tab Tiền vẫn vẽ được với dữ liệu rác", pg.locator("main [data-debtcard]").count() == 1 and pg.locator("main .crash").count() == 0)
    pg.context.close()
def d_narrow(b, w, scheme, big):
    pg = page(b, "sv", w=w, scheme=scheme, init="localStorage.setItem('hn-big','1')" if big else None); pg.set_default_timeout(4000)
    tag = f"{w}px {scheme}{' chữ to' if big else ''}"
    pg.evaluate("""() => { ['lẩu 600k chia 4', 'cho Nguyễn Văn Thành mượn 2tr500 thứ 6', 'mượn chị Lan Anh 1tr để đóng học phí', 'Hùng nợ mình 50k'].forEach(s => { quickReset(s); quickSave(); }); }""")
    pg.click("#nav [data-tab=money]"); pg.wait_for_timeout(200)
    over = lambda: pg.evaluate("() => { const s = document.querySelector('.sheet'); return [document.documentElement.scrollWidth - innerWidth, s ? s.scrollWidth - s.clientWidth : 0]; }")
    ok(f"2.8 nợ {tag}: tab Tiền có Sổ nợ không tràn ngang", max(over()) <= 0, str(over()))
    pg.locator("main [data-act=debt-person]").first.click(); pg.wait_for_timeout(400)
    pg.click(".sheet [data-da=part]"); pg.wait_for_timeout(100)
    ok(f"2.8 nợ {tag}: sheet một người không tràn", max(over()) <= 0, str(over()))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    pg.click("main [data-act=split]"); pg.wait_for_timeout(400)
    pg.fill(".sheet [name=total]", "1tr250"); pg.fill(".sheet [name=names]", "Nguyễn Văn Thành, Lan, Hùng")
    r = pg.evaluate("[...document.querySelectorAll('.sheet .stepper .btn, .sheet [data-pick=payer] button')].map(x => Math.round(x.getBoundingClientRect().height))")
    ok(f"2.8 chia tiền {tag}: form không tràn, nút cao >= 44px", max(over()) <= 0 and min(r) >= 44, f"{over()} {r}")
    pg.context.close()
with sync_playwright() as p:
    b = p.chromium.launch()
    run28("sổ nợ", d_main, b)
    for w, scheme, big in ((320, "light", True), (320, "dark", False), (393, "dark", True)):
        run28(f"sổ nợ {w}px", d_narrow, b, w, scheme, big)
    b.close()

# ---------- 2.8 B: tổng kết tuần ----------
WKSEED = """() => batch(() => {
  const tx = (d, a, cat, note) => put('tx', { type: 'out', amount: a, cat, note, date: d, at: 1 });
  tx('2026-10-12', 45000, 'an', 'phở'); tx('2026-10-13', 120000, 'an', 'lẩu'); tx('2026-10-14', 30000, 'nuoc', 'cà phê'); tx('2026-10-15', 80000, 'dilai', 'xăng'); tx('2026-10-17', 300000, 'muasam', 'áo');
  tx('2026-10-06', 50000, 'an', 'cơm'); tx('2026-10-08', 100000, 'giaitri', 'phim'); tx('2026-10-14', 999000, 'tietkiem', 'gửi tiết kiệm');
  const ms = d => new Date(d + 'T09:00:00+07:00').getTime();
  put('task', { title: 'Nộp BTL', type: 'bai', due: '2026-10-14', status: 'done', doneAt: ms('2026-10-15'), subs: [] });
  put('task', { title: 'Đọc sách', type: 'khac', due: '2026-10-13', status: 'done', doneAt: ms('2026-10-13'), subs: [] });
  put('task', { title: 'Gửi đơn', type: 'don', due: '2026-10-16', status: 'todo', subs: [] });
  put('task', { title: 'Họp nhóm', type: 'khac', due: '2026-10-22', status: 'todo', movedAt: ms('2026-10-16'), subs: [] });
  put('gymplan', { name: 'Kéo đẩy', start: '2026-10-01', until: '', src: '', days: [{ name: 'Kéo', dows: [1, 4], items: [{ ex: 'Hít xà', n: 3, lo: 8, hi: 10, unit: 'lần' }] }, { name: 'Đẩy', dows: [3], items: [{ ex: 'Chống đẩy', n: 3, lo: 15, unit: 'lần' }] }] });
  put('workout', { date: '2026-10-05', items: [{ ex: 'Hít xà', sets: [8, 8, 7] }], mins: 40, note: '' });
  put('workout', { date: '2026-10-12', items: [{ ex: 'Hít xà', sets: [9, 8, 8] }], mins: 40, note: '' });
  put('workout', { date: '2026-10-15', items: [{ ex: 'Hít xà', sets: [10, 9, 8] }], mins: 40, note: '' });
  put('weight', { date: '2026-10-12', kg: 80.2 }); put('weight', { date: '2026-10-18', kg: 79.6 }); setSetting('weightGoal', 70);
  put('debt', { who: 'Nam', amount: 200000, dir: 'lend', date: '2026-10-13', due: '', note: 'lẩu', paid: 0, paidAt: '', group: '' });
  put('class', { title: '<img src=x onerror=window.__xss=1>', days: [2], start: '07:00', end: '09:00', weeks: [], absent: ['2026-10-13', '2026-10-06'] });
})"""
def at(pg, d, h, m=0):
    pg.clock.set_system_time(datetime.datetime(*map(int, d.split("-")), h, m, tzinfo=TZ)); pg.evaluate("ui.tab = 'home'; render()"); pg.wait_for_timeout(100)
def w_main(b):
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    ok("2.8 tuần: chưa có dữ liệu thì không hiện thẻ Tuần qua (tối Chủ nhật)", (at(pg, "2026-10-18", 19, 30), pg.locator("[data-weekcard]").count())[1] == 0)
    pg.evaluate(WKSEED)
    S = pg.evaluate("weekSummary('2026-10-12')")
    ok("2.8 tuần: chi tiêu 575k so với tuần trước 150k, không tính tiết kiệm, 3 loại nhiều nhất",
       S["spend"]["cur"] == 575000 and S["spend"]["prev"] == 150000 and [x[0] for x in S["spend"]["top"]] == ["muasam", "an", "dilai"], str(S["spend"]))
    ok("2.8 tuần: việc xong 2, trễ hạn 2 (xong sau hạn, quá hạn chưa xong), dời 1", S["task"] == {"done": 2, "late": 2, "moved": 1}, str(S["task"]))
    ok("2.8 tuần: tập 2/3 buổi theo giáo án, 6 hiệp, kỷ lục mới Hít xà 10 (trước tuần này tốt nhất 8)",
       S["gym"]["planDone"] == 2 and S["gym"]["planned"] == 3 and S["gym"]["sets"] == 6 and S["gym"]["prs"] == [{"ex": "Hít xà", "best": 10, "old": 8}], str(S["gym"]))
    ok("2.8 tuần: cân nặng đầu và cuối tuần, mục tiêu", S["weight"]["first"]["kg"] == 80.2 and S["weight"]["last"]["kg"] == 79.6 and S["weight"]["goal"] == 70)
    ok("2.8 tuần: nợ còn lại và số buổi vắng trong tuần", S["debt"] == {"owe": 0, "lend": 200000} and len(S["absent"]) == 1, str([S["debt"], S["absent"]]))
    ok("2.8 tuần: văn bản chép có đủ các mục, không có gạch ngang dài",
       all(k in S["text"] for k in ("Tổng kết tuần 12/10 - 18/10", "- Chi tiêu: 575k", "- Việc: xong 2", "- Tập: 2/3", "- Cân nặng: 80,2 kg", "- Sổ nợ:", "- Vắng học: 1 buổi")) and "—" not in S["text"], S["text"])
    at(pg, "2026-10-18", 17, 59)
    ok("2.8 tuần: 17:59 Chủ nhật chưa hiện thẻ", pg.locator("[data-weekcard]").count() == 0)
    at(pg, "2026-10-18", 18, 0)
    card = pg.locator("[data-weekcard]")
    ok("2.8 tuần: 18:00 Chủ nhật hiện thẻ Tuần qua của tuần này", card.count() == 1 and "12/10 - 18/10" in card.inner_text())
    ok("2.8 tuần: tên lớp có thẻ HTML không chạy (XSS)", pg.evaluate("window.__xss") is None and pg.locator("main img").count() == 0)
    at(pg, "2026-10-19", 23, 30)
    ok("2.8 tuần: hết thứ Hai vẫn hiện tổng kết tuần trước", card.count() == 1 and "12/10 - 18/10" in card.inner_text())
    at(pg, "2026-10-20", 0, 1)
    ok("2.8 tuần: thứ Ba không hiện", card.count() == 0)
    at(pg, "2026-10-19", 9, 0)
    sz = pg.evaluate("[...document.querySelectorAll('[data-weekcard] .btn')].map(x => Math.round(x.getBoundingClientRect().height))")
    ok("2.8 tuần: nút Ẩn, Xem chi tiết cao >= 44px", len(sz) == 2 and min(sz) >= 44, str(sz))
    pg.click("[data-weekcard] [data-act=week-open]"); pg.wait_for_timeout(400)
    ok("2.8 tuần: sheet mở đúng tuần trước, nút › còn bấm được",
       pg.locator(".sheet [data-wkr]").inner_text() == "12/10 - 18/10" and pg.locator(".sheet [data-wks]").inner_text() == "Tuần trước" and not pg.locator(".sheet [data-wk='1']").is_disabled())
    pg.click(".sheet [data-wk='-1']"); pg.wait_for_timeout(100)
    ok("2.8 tuần: ‹ xem tuần 05/10 - 11/10", pg.locator(".sheet [data-wkr]").inner_text() == "05/10 - 11/10" and "1/3 buổi" in pg.locator(".sheet [data-wkbody]").inner_text())
    pg.click(".sheet [data-wk='1']"); pg.click(".sheet [data-wk='1']"); pg.wait_for_timeout(100)
    ok("2.8 tuần: › tới tuần này thì tắt nút ›", pg.locator(".sheet [data-wks]").inner_text() == "Tuần này" and pg.locator(".sheet [data-wk='1']").is_disabled())
    pg.click(".sheet [data-wk='-1']")
    pg.evaluate("window.__clip = ''; navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }")
    pg.click(".sheet [data-wkcopy]"); pg.wait_for_timeout(100)
    ok("2.8 tuần: Chép văn bản chép đúng bản tóm tắt", pg.evaluate("window.__clip") == pg.evaluate("weekSummary('2026-10-12').text"))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    pg.click("[data-weekcard] [data-act=week-hide]"); pg.wait_for_timeout(200)
    ok("2.8 tuần: Ẩn thì thẻ biến mất, lưu weekHide là thứ Hai của tuần đó", card.count() == 0 and pg.evaluate("getSetting('weekHide')") == "2026-10-12")
    pg.click("#toast button"); pg.wait_for_timeout(200)
    ok("2.8 tuần: Hoàn tác hiện lại thẻ", card.count() == 1)
    pg.evaluate("setSetting('weekHide', '2026-10-12')"); at(pg, "2026-10-25", 19, 0)
    ok("2.8 tuần: ẩn tuần trước không ẩn tuần sau", card.count() == 1 and "19/10 - 25/10" in card.inner_text())
    # chỉ hiện mục người dùng bật
    pg.evaluate("setSetting('weekHide', ''); setSetting('modules', { cal: false, gym: false, doc: true })"); at(pg, "2026-10-19", 9, 0)
    t = card.inner_text()
    ok("2.8 tuần: tắt Tập và Lịch học thì không có dòng Tập, Cân nặng, Vắng học", "Tập" not in t and "Cân nặng" not in pg.evaluate("weekSummary('2026-10-12').text") and "Vắng học" not in pg.evaluate("weekSummary('2026-10-12').text"))
    # việc dời: dời bằng thao tác nhanh thì có movedAt, dời về trước thì không
    pg.evaluate("setSetting('modules', { cal: true, gym: true, doc: true })")
    tid = pg.evaluate("all('task').find(t => t.data.title === 'Gửi đơn').id")
    pg.evaluate(f"moveTask('{tid}', '2026-10-21')")
    ok("2.8 tuần: dời việc sang ngày sau thì ghi movedAt (đếm vào việc dời)", pg.evaluate(f"db['{tid}'].data.movedAt > 0") and pg.evaluate("weekSummary('2026-10-19').task.moved") == 1)
    tid2 = pg.evaluate("all('task').find(t => t.data.title === 'Họp nhóm').id")
    pg.evaluate(f"moveTask('{tid2}', '2026-10-20')")
    ok("2.8 tuần: dời lên sớm hơn không tính là dời", pg.evaluate(f"db['{tid2}'].data.movedAt") == pg.evaluate("Date.parse('2026-10-16T09:00:00+07:00')"))
    ok("2.8 tuần: NORM weekHide sai kiểu thành rỗng, thẻ vẫn vẽ", pg.evaluate("normalize('setting', { key: 'weekHide', value: 123 }).value") == "" and pg.evaluate("normalize('task', { movedAt: 'x' }).movedAt") == 0)
    pg.context.close()
def w_narrow(b, w, scheme, big):
    pg = page(b, "sv", w=w, scheme=scheme, init="localStorage.setItem('hn-big','1')" if big else None); pg.set_default_timeout(4000)
    tag = f"{w}px {scheme}{' chữ to' if big else ''}"
    pg.evaluate(WKSEED); at(pg, "2026-10-19", 9, 0)
    over = lambda: pg.evaluate("() => { const s = document.querySelector('.sheet'); return [document.documentElement.scrollWidth - innerWidth, s ? s.scrollWidth - s.clientWidth : 0]; }")
    ok(f"2.8 tuần {tag}: thẻ Tuần qua không tràn", pg.locator("[data-weekcard]").count() == 1 and max(over()) <= 0, str(over()))
    pg.click("[data-weekcard] [data-act=week-open]"); pg.wait_for_timeout(400)
    ok(f"2.8 tuần {tag}: sheet tổng kết không tràn", max(over()) <= 0, str(over()))
    pg.context.close()
with sync_playwright() as p:
    b = p.chromium.launch()
    run28("tổng kết tuần", w_main, b)
    for w, scheme, big in ((320, "light", True), (320, "dark", False), (393, "dark", True)):
        run28(f"tổng kết tuần {w}px", w_narrow, b, w, scheme, big)
    b.close()

# ---------- 2.8 C: nhắc đẩy lịch học, buổi tập (phần app; phần server ở tests/push_test.mjs) ----------
def c_main(b):
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    # đối chiếu: app (classesOn, lịch tháng) và bản sched.js của hàm hn-push cho cùng kết quả buổi học trong 400 ngày
    fn_src = open(os.path.join(ROOT, "supabase", "functions", "hn-push", "sched.js"), encoding="utf-8").read()
    r = pg.evaluate("""(src) => {
      const app = window.HN_SCHED; new Function(src)(); const fn = window.HN_SCHED; window.HN_SCHED = app;
      batch(() => {
        put('class', { title: 'A', days: [1, 3], start: '07:00', end: '09:00', weeks: [1, 2, 3, 35, 36, 40, 41, 42, 43, 52, 53], absent: ['2026-10-19', '2027-01-04'] });
        put('class', { title: 'B', days: [0, 6], start: '13:00', end: '15:00', weeks: [], absent: ['2026-10-24'] });
        put('class', { title: 'C', days: [5], start: '18:00', end: '20:00', weeks: [44, 45, 46, 47, 48, 49, 50, 51, 52, 1, 2], absent: [] });
      });
      let diff = [], n = 0;
      for (let i = -60; i < 340; i++) {
        const d = addDays('2026-10-18', i), dow = parseYmd(d).getDay();
        const a = classesOn(dow, d).filter(c => !(c.data.absent || []).includes(d)).map(c => c.data.title).sort().join();
        const f = all('class').filter(c => fn.classMeets(c.data, d, true)).map(c => c.data.title).sort().join();
        if (app.isoWeek(d) !== fn.isoWeek(d) || isoWeek(d) !== fn.isoWeek(d)) diff.push(d + ' tuần');
        if (a !== f) diff.push(d + ': ' + a + ' / ' + f); n += a ? a.split(',').length : 0;
      }
      return { diff, n };
    }""", fn_src)
    ok("2.8 nhắc: app và hàm hn-push tính cùng buổi học, cùng tuần ISO trong 400 ngày (có tuần 53, buổi vắng)", not r["diff"] and r["n"] > 100, str(r)[:300])
    r = pg.evaluate("""(src) => {
      const app = window.HN_SCHED; new Function(src)(); const fn = window.HN_SCHED; window.HN_SCHED = app;
      put('gymplan', { name: 'P1', start: '2026-10-01', until: '2026-12-31', src: '', days: [{ name: 'Kéo', dows: [1, 4], items: [{ ex: 'Hít xà', n: 3, lo: 8 }] }, { name: 'Bù', date: '2026-10-22', items: [{ ex: 'Plank', n: 1, lo: 60, unit: 'giây' }] }, { name: '', dows: [2], rest: true, items: [] }] });
      put('gymplan', { name: 'P2', start: '2026-11-15', until: '', src: '', days: [{ name: 'Đẩy', dows: [3], items: [{ ex: 'Chống đẩy', n: 3, lo: 15 }] }] });
      const plans = fn.sortPlans(all('gymplan')), diff = [];
      for (let i = -30; i < 120; i++) { const d = addDays('2026-10-18', i), a = gymDay(d), f = fn.planDay(fn.planAt(plans, d), d);
        if (JSON.stringify(a) !== JSON.stringify(f)) diff.push(d); }
      return diff;
    }""", fn_src)
    ok("2.8 nhắc: buổi tập theo giáo án của app (gymDay) và của hàm hn-push giống nhau từng ngày", not r, str(r)[:200])
    # thẻ Thông báo: nhắc thêm
    pg.evaluate("pushState = async () => ({ st: 'on' })")
    pg.click("[data-act=settings]"); pg.wait_for_timeout(500)
    box = pg.locator(".sheet [data-pushmore]")
    ok("2.8 nhắc: thẻ Thông báo có Nhắc thêm: giờ vào lớp, buổi tập, tổng kết tuần (mặc định tắt)",
       box.count() == 1 and box.locator("[data-pick=classRemind] button.on").get_attribute("data-v") == "0" and "on" not in box.locator("[data-gymrem]").get_attribute("class") and "on" not in box.locator("[data-weekrem]").get_attribute("class"))
    box.locator("[data-pick=classRemind] [data-v='15']").click(); pg.wait_for_timeout(100)
    ok("2.8 nhắc: chọn 15 phút lưu classRemind = 15 (số)", pg.evaluate("getSetting('classRemind')") == 15)
    box.locator("[data-gymrem]").click(); pg.wait_for_timeout(100)
    ok("2.8 nhắc: bật nhắc buổi tập thì mặc định 18:00, hiện ô giờ", pg.evaluate("getSetting('gymRemind')") == "18:00" and box.locator("[name=gymRemind]").is_visible())
    box.locator("[name=gymRemind]").fill("06:30"); box.locator("[name=gymRemind]").dispatch_event("change"); pg.wait_for_timeout(100)
    ok("2.8 nhắc: đổi giờ nhắc buổi tập", pg.evaluate("getSetting('gymRemind')") == "06:30")
    box.locator("[data-weekrem]").click(); pg.wait_for_timeout(100)
    ok("2.8 nhắc: bật nhắc tổng kết tuần", pg.evaluate("getSetting('weekRemind')") is True)
    box.locator("[data-gymrem]").click(); pg.wait_for_timeout(100)
    ok("2.8 nhắc: tắt nhắc buổi tập thì gymRemind rỗng", pg.evaluate("getSetting('gymRemind')") == "")
    sz = pg.evaluate("[...document.querySelectorAll('.sheet [data-pushmore] button, .sheet [data-pushmore] input')].filter(x => x.getClientRects().length).map(x => Math.round(x.getBoundingClientRect().height))")
    ok("2.8 nhắc: nút và ô trong Nhắc thêm cao >= 44px", sz and min(sz) >= 44, str(sz))
    ok("2.8 nhắc: NORM_SETTING sửa giá trị lạ (phút lạ, giờ sai, chữ thay cho true)",
       pg.evaluate("[normalize('setting', { key: 'classRemind', value: 7 }).value, normalize('setting', { key: 'classRemind', value: '30' }).value, normalize('setting', { key: 'gymRemind', value: '25:00' }).value, normalize('setting', { key: 'weekRemind', value: 'yes' }).value]") == [0, 30, "", False])
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    pg.evaluate("applyPersona('work')"); pg.wait_for_timeout(100)
    pg.click("[data-act=settings]"); pg.wait_for_timeout(500)
    ok("2.8 nhắc: tắt Lịch học thì không có dòng nhắc giờ vào lớp", pg.locator(".sheet [data-pushmore]").count() == 1 and pg.locator(".sheet [data-pick=classRemind]").count() == 0)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    pg.evaluate("applyPersona('sv')"); pg.wait_for_timeout(100)
    # chạm vào thông báo: mở đúng chỗ
    pg.evaluate("openFromUrl(location.origin + '/?tab=cal&date=2026-10-21')"); pg.wait_for_timeout(300)
    ok("2.8 nhắc: chạm nhắc lịch học mở tab Lịch dạng Tuần, đúng thứ Tư 21/10 (tuần tới)",
       pg.evaluate("[ui.tab, ui.calView, ui.calWeek, ui.calDay]") == ["cal", "week", 1, 3] and "21/10" in pg.locator("main .card-h h2").first.inner_text())
    pg.evaluate("openFromUrl(location.origin + '/?gymday=2026-10-19')"); pg.wait_for_timeout(400)
    ok("2.8 nhắc: chạm nhắc buổi tập mở sheet buổi tập ngày đó", pg.evaluate("ui.tab") == "gym" and "19/10" in pg.locator(".sheet h3").inner_text())
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(400)
    pg.evaluate("openFromUrl(location.origin + '/?week=1')"); pg.wait_for_timeout(400)
    ok("2.8 nhắc: chạm nhắc tổng kết tuần mở sheet Tổng kết tuần", pg.locator(".sheet h3").inner_text() == "Tổng kết tuần")
    pg.context.close()
def c_narrow(b, w, scheme, big):
    pg = page(b, "sv", w=w, scheme=scheme, init="localStorage.setItem('hn-big','1')" if big else None); pg.set_default_timeout(4000)
    pg.evaluate("pushState = async () => ({ st: 'on' }); setSetting('gymRemind', '18:00')")
    pg.click("[data-act=settings]"); pg.wait_for_timeout(500)
    r = pg.evaluate("() => { const s = document.querySelector('.sheet'), m = s.querySelector('[data-pushmore]'); return [document.documentElement.scrollWidth - innerWidth, s.scrollWidth - s.clientWidth, m ? m.scrollWidth - m.clientWidth : 99]; }")
    ok(f"2.8 nhắc {w}px {scheme}{' chữ to' if big else ''}: thẻ Thông báo không tràn", max(r) <= 0, str(r))
    pg.context.close()
with sync_playwright() as p:
    b = p.chromium.launch()
    run28("nhắc đẩy (app)", c_main, b)
    for w, scheme, big in ((320, "light", True), (320, "dark", False)):
        run28(f"nhắc đẩy {w}px", c_narrow, b, w, scheme, big)
    b.close()

# ---------- 2.8 D: sửa các lỗi còn lại ----------
def dd_repeat(b):
    # dữ liệu kiểu 2.6.1: lần đã xong (lặp hằng năm / âm lịch) và lần sau do máy 2.6.1 tạo, lệch sang tháng sau
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    ids = pg.evaluate("""() => {
      const d = JSON.parse(localStorage.getItem('hn-db') || '{}'), ms = s => new Date(s + 'T10:00:00+07:00').getTime(), add = (data) => { const id = crypto.randomUUID(); d[id] = { id, kind: 'task', data, deleted: false, updated_at: '2026-01-01T00:00:00.000Z' }; return id; };
      // 1) sinh nhật hằng năm: xong 10/10/2025 trên máy 2.6.1 → lần sau 10/11/2025 (đúng phải là 10/10/2026)
      const a = add({ title: 'Sinh nhật mẹ', type: 'khac', due: '2025-10-10', status: 'done', doneAt: ms('2025-10-10'), repeat: 'year', subs: [] });
      const a2 = add({ title: 'Sinh nhật mẹ', type: 'khac', due: '2025-11-10', status: 'todo', doneAt: null, repeat: 'year', series: a, createdAt: ms('2025-10-10'), subs: [] });
      // 2) giỗ âm lịch: xong 19/10/2026 (10/9 âm) nhưng bấm Xong trễ ngày 20/12/2026 → 2.6.1 cộng tháng tới 19/12/2026, rồi 19/01/2027
      const g = add({ title: 'Giỗ ông', type: 'khac', due: '2026-10-19', status: 'done', doneAt: ms('2026-12-20'), repeat: 'lunar-year', day: 10, subs: [] });
      const g2 = add({ title: 'Giỗ ông', type: 'khac', due: '2027-01-19', status: 'todo', doneAt: null, repeat: 'lunar-year', day: 10, series: g, createdAt: ms('2026-12-20'), subs: [] });
      // 3) rằm hằng tháng âm lịch: xong 24/10/2026 (rằm tháng 9) → 2.6.1 đặt 24/11/2026
      const r = add({ title: 'Thắp hương', type: 'khac', due: '2026-10-24', status: 'done', doneAt: ms('2026-10-24'), repeat: 'lunar-month', day: 15, subs: [] });
      const r2 = add({ title: 'Thắp hương', type: 'khac', due: '2026-11-24', status: 'todo', doneAt: null, repeat: 'lunar-month', day: 15, series: r, createdAt: ms('2026-10-24'), subs: [] });
      // 4) không đụng: bản 2.7 tạo đúng; lặp hằng tháng; hạn người dùng tự đặt khác dấu vết 2.6.1
      const ok1 = add({ title: 'Đúng rồi', type: 'khac', due: '2025-10-05', status: 'done', doneAt: ms('2025-10-05'), repeat: 'year', subs: [] });
      const ok2 = add({ title: 'Đúng rồi', type: 'khac', due: '2026-10-05', status: 'todo', repeat: 'year', series: ok1, createdAt: ms('2025-10-05'), subs: [] });
      const m1 = add({ title: 'Tiền mạng', type: 'khac', due: '2026-09-05', status: 'done', doneAt: ms('2026-09-05'), repeat: 'month', subs: [] });
      const m2 = add({ title: 'Tiền mạng', type: 'khac', due: '2026-10-05', status: 'todo', repeat: 'month', series: m1, createdAt: ms('2026-09-05'), subs: [] });
      const u1 = add({ title: 'Kỷ niệm', type: 'khac', due: '2025-06-01', status: 'done', doneAt: ms('2025-06-01'), repeat: 'year', subs: [] });
      const u2 = add({ title: 'Kỷ niệm', type: 'khac', due: '2026-05-30', status: 'todo', repeat: 'year', series: u1, createdAt: ms('2025-06-01'), subs: [] });
      localStorage.setItem('hn-db', JSON.stringify(d));
      return { a2, g2, r2, ok2, m2, u2 };
    }""")
    pg.reload(); pg.wait_for_timeout(500)
    due = lambda i: pg.evaluate(f"db['{i}'].data.due")
    ok("2.8 lặp: lần sau của việc hằng năm do máy 2.6.1 đặt lệch (10/11/2025) được sửa về 10/10/2026", due(ids["a2"]) == "2026-10-10", due(ids["a2"]))
    ok("2.8 lặp: giỗ âm lịch bấm Xong trễ trên máy 2.6.1 (19/01/2027) sửa về 10/9 âm năm sau", due(ids["g2"]) == pg.evaluate("nextDue('2026-10-19', 'lunar-year', 10)") and due(ids["g2"]) != "2027-01-19", due(ids["g2"]))
    ok("2.8 lặp: rằm hằng tháng âm do 2.6.1 đặt 24/11 sửa về rằm tháng sau", due(ids["r2"]) == pg.evaluate("nextDue('2026-10-24', 'lunar-month', 15)"), due(ids["r2"]))
    ok("2.8 lặp: không đụng việc đúng sẵn, lặp hằng tháng, hạn người dùng tự đặt",
       [due(ids["ok2"]), due(ids["m2"]), due(ids["u2"])] == ["2026-10-05", "2026-10-05", "2026-05-30"])
    ok("2.8 lặp: bản sửa được đưa vào hàng chờ đồng bộ (máy khác cũng nhận)", pg.evaluate(f"!!queue['{ids['a2']}'] && !queue['{ids['ok2']}']"))
    # chỉ sửa một lần: người dùng đặt lại đúng ngày cũ thì không sửa nữa
    pg.evaluate(f"put('task', {{ ...db['{ids['a2']}'].data, due: '2025-11-10' }}, '{ids['a2']}')"); pg.reload(); pg.wait_for_timeout(500)
    ok("2.8 lặp: chỉ sửa một lần (đặt lại hạn cũ rồi mở lại app thì giữ nguyên)", due(ids["a2"]) == "2025-11-10" and pg.evaluate("repairRepeats()") == 0)
    pg.context.close()
def dd_bill(b):
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    t = pg.evaluate("put('task', { title: 'Tiền nhà', type: 'khac', due: '2026-08-05', status: 'todo', repeat: 'month', day: 5, amount: 3000000, cat: 'nha', subs: [] }).id")
    w = pg.evaluate("put('task', { title: 'Tưới cây', type: 'khac', due: '2026-09-01', status: 'todo', repeat: 'week', subs: [] }).id")
    pg.evaluate(f"toggleTask('{t}'); toggleTask('{w}')"); pg.wait_for_timeout(200)
    nxt = pg.evaluate("all('task').filter(x => x.data.status === 'todo').map(x => [x.data.title, x.data.due]).sort()")
    ok("2.8 phải trả: tiền nhà lỡ 2 kỳ, xong kỳ 05/08 thì kỳ kế tiếp là 05/09 (không nhảy tới 05/11)", ["Tiền nhà", "2026-09-05"] in nxt, str(nxt))
    ok("2.8 phải trả: việc không có tiền vẫn nhảy tới kỳ sắp tới (tưới cây 20/10)", ["Tưới cây", "2026-10-20"] in nxt, str(nxt))
    t2 = pg.evaluate("all('task').find(x => x.data.title === 'Tiền nhà' && x.data.status === 'todo').id")
    pg.evaluate(f"toggleTask('{t2}')"); pg.wait_for_timeout(200)
    ok("2.8 phải trả: xong tiếp thì tới 05/10 rồi 05/11, mỗi kỳ ghi một khoản chi", pg.evaluate("all('task').some(x => x.data.title === 'Tiền nhà' && x.data.status === 'todo' && x.data.due === '2026-10-05')") and pg.evaluate("all('tx').filter(x => x.data.note === 'Tiền nhà').length") == 2)
    pg.context.close()
FAKE28 = """(o) => {
  window.__rpc = []; window.__authCb = null; window.__rows = o.rows || [];
  const q = { select() { return q; }, gt() { return q; }, order() { return q; }, limit() { return Promise.resolve({ data: window.__rows, error: null }); } };
  const fake = { auth: { onAuthStateChange(cb) { window.__authCb = cb; return { data: { subscription: {} } }; }, signOut: async () => ({ error: null }) },
    rpc: async (name, args) => { window.__rpc.push(args.rows.map(r => r.id)); return window.__rpcErr ? window.__rpcErr(args.rows) : { error: null }; },
    from() { return q; }, channel() { return { on() { return this; }, subscribe() { return this; } }; }, removeChannel() {} };
  window.supabase = { createClient: () => fake };
  CFG.supabaseUrl = 'https://x.supabase.co'; CFG.supabaseAnonKey = 'k'; sync.sb = null; initSync();
  if (o.owner) localStorage.setItem('hn-owner', JSON.stringify(o.owner));
}"""
def dd_sync(b):
    def login(pg, uid):
        pg.evaluate(f"__authCb('SIGNED_IN', {{ user: {{ id: '{uid}', email: '{uid}@vd.vn' }} }})"); pg.wait_for_timeout(200); pg.clock.run_for(100); pg.wait_for_timeout(300)
    # máy chỉ có cài đặt của A, đăng nhập B: lấy cài đặt của B, không đẩy cài đặt của A lên
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    pg.evaluate("setSetting('budget', 5000000); setSetting('name', 'Của A')")
    rowB = {"id": "11111111-1111-4111-8111-111111111111", "kind": "setting", "data": {"key": "name", "value": "Của B"}, "deleted": False, "updated_at": "2026-01-01T00:00:00.000Z", "server_at": "2026-01-01T00:00:00.000Z"}
    pg.evaluate(FAKE28, {"owner": "A", "rows": [rowB]})
    login(pg, "B"); pg.clock.run_for(1500); pg.wait_for_timeout(300)
    ok("2.8 đồng bộ: máy chỉ có cài đặt đăng nhập tài khoản khác thì không hỏi, không đẩy cài đặt trên máy lên",
       pg.locator(".sheet [data-acct]").count() == 0 and "Của A" not in json.dumps(pg.evaluate("__rpc")) and pg.evaluate("__rpc.flat().length") == 0, str(pg.evaluate("__rpc")))
    ok("2.8 đồng bộ: lấy cài đặt của tài khoản mới (tên B, không còn ngân sách của A), nhớ chủ mới",
       pg.evaluate("[getSetting('name', ''), getSetting('budget', 0), JSON.parse(localStorage.getItem('hn-owner'))]") == ["Của B", 0, "B"], str(pg.evaluate("[getSetting('name', ''), getSetting('budget', 0)]")))
    pg.context.close()
    # máy có dữ liệu thật vẫn hỏi như 2.7
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    pg.evaluate("setSetting('name', 'A'); put('tx', { type: 'out', amount: 1000, cat: 'an', note: 'x', date: '2026-10-18', at: 1 })")
    pg.evaluate(FAKE28, {"owner": "A"}); login(pg, "B")
    ok("2.8 đồng bộ: máy có dữ liệu thì vẫn hỏi gộp hay bắt đầu trống", pg.locator(".sheet [data-acct=merge]").count() == 1)
    pg.context.close()
    # hn-skip: tự thử lại khi mở app, tối đa 6 giờ một lần
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    big = pg.evaluate("put('task', { title: 'Mục to', type: 'khac', due: '', status: 'todo', subs: [], note: 'x' }).id")
    pg.evaluate(FAKE28, {})
    pg.evaluate(f"window.__rpcErr = rows => rows.some(r => r.id === '{big}') ? {{ error: {{ code: '23514', message: 'violates check constraint' }} }} : {{ error: null }}; 0")
    login(pg, "A"); pg.clock.run_for(1500); pg.wait_for_timeout(300)
    ok("2.8 skip: mục bị máy chủ từ chối vào hn-skip, ghi lúc bị từ chối", pg.evaluate(f"!!JSON.parse(localStorage.getItem('hn-skip'))['{big}'] && +localStorage.getItem('hn-skipAt') > 0"))
    pg.evaluate("window.__rpcErr = null; __rpc.length = 0")
    vis = "Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange'))"
    pg.evaluate(vis); pg.wait_for_timeout(300)
    ok("2.8 skip: mở lại app trong 6 giờ thì chưa thử lại", pg.evaluate(f"__rpc.flat().includes('{big}')") is False)
    pg.clock.run_for(6 * 3600 * 1000 + 1000); pg.wait_for_timeout(200); pg.evaluate("__rpc.length = 0")
    pg.evaluate(vis); pg.wait_for_timeout(400)
    ok("2.8 skip: quá 6 giờ, mở lại app thì tự thử lại và lên được", pg.evaluate(f"__rpc.flat().includes('{big}') && !queue['{big}']") and pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('hn-skip') || '{}')).length") == 0)
    pg.context.close()
import json
with sync_playwright() as p:
    b = p.chromium.launch()
    run28("lặp lệch 2.6.1", dd_repeat, b)
    run28("phải trả lỡ kỳ", dd_bill, b)
    run28("đồng bộ, skip", dd_sync, b)
    b.close()

# ---------- 2.8: giáo án linh hoạt (xoay vòng, nghỉ ngày nào cũng được) ----------
# Giờ giả CN 18/10/2026: tuần này 12/10 - 18/10. Buổi tiếp theo = kế sau buổi tập gần nhất (workout.pdi), không có "bỏ lỡ".
ROT_SRC = "Buổi 1 - Kéo\n- Hít xà 4x8\nBuổi 2 - Đẩy\n- Xà kép 4x8\n- Chống đẩy 3x10\nBuổi 3 - Chân\n- Squat 4x12\nChủ nhật: Nghỉ"
def d_rot(b):
    pg = page(b, "sv"); pg.set_default_timeout(4000)
    pg.click("#nav [data-tab=gym]"); pg.wait_for_timeout(200)
    pg.evaluate("gpPasteSheet()"); pg.wait_for_timeout(350)
    pg.fill(".sheet [name=gpsrc]", ROT_SRC); pg.fill(".sheet [name=gpstart]", "2026-10-01"); pg.wait_for_timeout(200)
    prev = pg.inner_text(".sheet [data-gpprev]")
    ok("2.8 linh hoạt: xem trước 3 buổi xoay vòng, bỏ qua ngày nghỉ, mặc định 3 buổi mỗi tuần",
       "3 buổi xoay vòng, tập 3 buổi mỗi tuần" in prev and "Bỏ qua 1 ngày nghỉ" in prev and pg.input_value(".sheet [name=gp-per]") == "3", prev[:300])
    pg.click(".sheet [data-gpsave]"); pg.wait_for_timeout(400); pg.clock.run_for(5000)
    d = pg.evaluate("all('gymplan')[0].data")
    ok("2.8 linh hoạt: lưu mode rot, perWeek 3, 3 buổi không có thứ, không lưu ngày nghỉ",
       d["mode"] == "rot" and d["perWeek"] == 3 and [(x["name"], x["dows"], x["rest"]) for x in d["days"]] == [("Kéo", [], False), ("Đẩy", [], False), ("Chân", [], False)], str(d)[:300])
    st = pg.evaluate("[gymDay('2026-10-18').name, gymDay('2026-10-18').next, gymDay('2026-10-17'), gymDay('2026-10-25'), gymStatus('2026-10-15').st]")
    ok("2.8 linh hoạt: hôm nay là buổi tiếp theo (Kéo), ngày đã qua chưa tập không bỏ lỡ, ngày sau không xếp sẵn", st == ["Kéo", True, None, None, "none"], str(st))
    card = pg.inner_text("main .gtoday")
    ok("2.8 linh hoạt: thẻ tab Tập ghi Buổi tiếp theo, tuần này 0/3 buổi", card.startswith("Buổi tiếp theo") and "Kéo" in card and "Tuần này 0/3 buổi" in card, card)
    wk = pg.inner_text("main .gcal")
    ok("2.8 linh hoạt: lịch tuần không có Bỏ lỡ, ngày đã qua ghi Nghỉ, tuần 0/3 buổi", "Bỏ lỡ" not in wk and "0/3 buổi" in wk and "Nghỉ" in pg.inner_text("main .gwd[data-date='2026-10-15']"), wk[:300])
    # tập hôm nay: chạm hiệp thì ghi workout có pdi, hết cho đổi buổi
    pg.click("main .gtoday"); pg.wait_for_timeout(400)
    ok("2.8 linh hoạt: sheet hôm nay có hàng chọn 3 buổi, đang chọn Buổi 1 · Kéo",
       pg.locator(".sheet [data-ga=pickday]").count() == 3 and pg.inner_text(".sheet [data-ga=pickday][aria-pressed=true]") == "Buổi 1 · Kéo")
    pg.click(gset("p0", 0)); pg.wait_for_timeout(200)
    w = pg.evaluate("all('workout').map(r => r.data)")
    ok("2.8 linh hoạt: tick hiệp ghi workout hôm nay có planId, pdi 0, pname Kéo", len(w) == 1 and w[0]["date"] == "2026-10-18" and w[0]["pdi"] == 0 and w[0]["pname"] == "Kéo" and w[0]["items"][0]["sets"] == [8], str(w))
    ok("2.8 linh hoạt: đã tick thì không còn hàng chọn buổi", pg.locator(".sheet [data-ga=pickday]").count() == 0)
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    # ghi bù thứ Sáu 16/10: chọn Buổi 2 (Đẩy)
    pg.evaluate("gymDaySheet('2026-10-16')"); pg.wait_for_timeout(400)
    ok("2.8 linh hoạt: ngày đã qua chưa tập vẫn mở được buổi để ghi bù, gợi ý Kéo", "Ghi bù" in pg.inner_text(".sheet [data-gbody]") and pg.inner_text(".sheet [data-ga=pickday][aria-pressed=true]") == "Buổi 1 · Kéo")
    pg.click(".sheet [data-ga=pickday][data-di='1']"); pg.wait_for_timeout(200)
    ok("2.8 linh hoạt: chọn Buổi 2 thì hiện bài của Đẩy", "Xà kép" in pg.inner_text(".sheet [data-gbody]") and "Hít xà" not in pg.inner_text(".sheet [data-gbody]"))
    pg.click(gset("p1", 0)); pg.wait_for_timeout(200)
    w16 = pg.evaluate("all('workout').filter(r => r.data.date === '2026-10-16').map(r => [r.data.pdi, r.data.pname, r.data.items.map(i => [i.ex, i.sets])])")
    ok("2.8 linh hoạt: ghi bù 16/10 lưu pdi 1 (Đẩy)", w16 == [[1, "Đẩy", [["Chống đẩy", [10]]]]], str(w16))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    nx = pg.evaluate("(() => { const p = all('gymplan')[0], ws = all('workout'); return [HN_SCHED.planDay(p, '2026-10-19', { ws, today: '2026-10-19' }).name, gymDay('2026-10-16').name, gymDay('2026-10-18').name, gymRotWeek('2026-10-18').done]; })()")
    ok("2.8 linh hoạt: mai (19/10) là Đẩy (kế Kéo hôm nay); 16/10 là Đẩy; tuần này 2 buổi", nx == ["Đẩy", "Đẩy", "Kéo", 2], str(nx))
    ok("2.8 linh hoạt: trang Hôm nay và lịch tuần ghi 2/3 buổi", "2/3 buổi" in pg.inner_text("main .gcal"), pg.inner_text("main .gcal")[:200])
    # bỏ tick hôm nay thì buổi tiếp theo hôm nay là kế buổi 16/10 (Đẩy) = Chân
    pg.evaluate("gymDaySheet('2026-10-18')"); pg.wait_for_timeout(400)
    pg.click(gset("p0", 0)); pg.wait_for_timeout(200)
    ok("2.8 linh hoạt: bỏ hết tick hôm nay thì xóa buổi, hôm nay thành Chân", pg.evaluate("[all('workout').length, gymDay('2026-10-18').name]") == [1, "Chân"], str(pg.evaluate("[all('workout').length, gymDay('2026-10-18') && gymDay('2026-10-18').name]")))
    pg.evaluate("closeSheet()"); pg.wait_for_timeout(300)
    pg.click("#nav [data-tab=home]"); pg.wait_for_timeout(200)
    home = pg.inner_text("main [data-hometoday]") if pg.locator("main [data-hometoday]").count() else ""
    ok("2.8 linh hoạt: trang Hôm nay ghi Buổi tiếp theo: Chân", "Buổi tiếp theo: Chân" in home, home)
    pg.click("#nav [data-tab=gym]"); pg.wait_for_timeout(200)
    # quản lý: không có thứ thì không chuyển sang cố định được; đổi số buổi mỗi tuần
    pg.evaluate("gpClick('gp-manage')"); pg.wait_for_timeout(400)
    ok("2.8 linh hoạt: Quản lý hiện Linh hoạt, nút Cố định bị khóa vì giáo án không ghi thứ",
       pg.locator(".sheet [data-gpmmode=rot].on").count() == 1 and pg.locator(".sheet [data-gpmmode=fix]").is_disabled() and "Buổi 3" in pg.inner_text(".sheet [data-gpmdays]"))
    pg.select_option(".sheet [name=gp-mper]", "4"); pg.click(".sheet [data-gpsave]"); pg.wait_for_timeout(300)
    ok("2.8 linh hoạt: đổi thành 4 buổi mỗi tuần", pg.evaluate("[all('gymplan')[0].data.perWeek, all('gymplan')[0].data.mode]") == [4, "rot"])
    pg.clock.run_for(5000)
    xp = pg.evaluate("gpExport('4w').text")
    ok("2.8 linh hoạt: xuất ghi linh hoạt, 4 buổi mỗi tuần, không có bỏ lỡ", "linh hoạt, 4 buổi mỗi tuần, xoay vòng Buổi 1 Kéo, Buổi 2 Đẩy, Buổi 3 Chân" in xp and "bỏ lỡ" not in xp and "1 buổi theo giáo án linh hoạt" in xp, xp[-400:])
    # NORM: rác thành mặc định, bản cũ không có mode là theo thứ
    nm = pg.evaluate("[normalize('gymplan', { mode: 'x', perWeek: 9 }), normalize('gymplan', { mode: 'rot', perWeek: '5' }), normalize('workout', { pdi: '2' }).pdi, normalize('workout', { pdi: -1 }).pdi]")
    ok("2.8 linh hoạt: NORM mode, perWeek, pdi", nm == [{"mode": "", "perWeek": ""}, {"mode": "rot", "perWeek": 5}, 2, ""], str(nm))
    # giáo án theo thứ đổi sang linh hoạt trong Quản lý
    pg.evaluate("""put('gymplan', { name: 'Theo thứ', start: '2026-10-18', until: '', days: [{ name: 'A', dows: [1], date: '', rest: false, items: [{ ex: 'Hít xà', n: 3, lo: 5, hi: 0, max: false, unit: 'lần', kg: '', side: false, note: '' }] },
        { name: 'B', dows: [4], date: '', rest: false, items: [{ ex: 'Squat', n: 3, lo: 10, hi: 0, max: false, unit: 'lần', kg: '', side: false, note: '' }] }] })""")
    ok("2.8 linh hoạt: giáo án theo thứ (CN không có buổi) thì hôm nay không có bài", pg.evaluate("gymDay('2026-10-18')") is None)
    pg.evaluate("gpClick('gp-manage')"); pg.wait_for_timeout(400)
    pg.click(".sheet [data-gpmmode=rot]"); pg.wait_for_timeout(150); pg.click(".sheet [data-gpsave]"); pg.wait_for_timeout(300)
    ok("2.8 linh hoạt: Quản lý đổi giáo án theo thứ sang linh hoạt thì hôm nay có buổi A", pg.evaluate("[gymPlanAt('2026-10-18').data.mode, gymDay('2026-10-18').name, gymDay('2026-10-18').next]") == ["rot", "A", True])
    pg.context.close()
    for scheme in ("light", "dark"):
        np_ = page(b, "sv", 320, scheme); np_.set_default_timeout(3000)
        np_.evaluate("put('gymplan', { name: 'Linh hoạt', start: '2026-10-01', until: '', mode: 'rot', perWeek: 5, days: [...['Kéo và chân', 'Đẩy và cardio', 'Chân và lưng', 'Thân trên', 'Tổng hợp và cardio dài'].map(name => ({ name, dows: [], date: '', rest: false, items: [{ ex: 'Bulgarian split squat', n: 3, lo: 8, hi: 12, max: false, unit: 'lần', kg: 8, side: true, note: '' }] }))] })")
        np_.click("#nav [data-tab=gym]"); np_.wait_for_timeout(200)
        ok(f"2.8 linh hoạt 320 {scheme}: tab Tập không tràn ngang", np_.evaluate("document.documentElement.scrollWidth") <= 320)
        np_.click("main .gtoday"); np_.wait_for_timeout(400)
        wide = np_.evaluate("(() => { const s = document.querySelector('.sheet'); return [...s.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > s.getBoundingClientRect().right + 0.5 && e.getClientRects().length).map(e => e.tagName + '.' + e.className).slice(0, 3); })()")
        hmin = np_.evaluate("Math.min(...[...document.querySelectorAll('.sheet [data-ga=pickday]')].map(x => x.getBoundingClientRect().height))")
        ok(f"2.8 linh hoạt 320 {scheme}: sheet có hàng chọn 5 buổi không tràn, nút cao ít nhất 44px, không có —", not wide and hmin >= 44 and "—" not in np_.inner_text(".sheet"), f"{wide} {hmin}")
        np_.screenshot(path=os.path.join(os.environ.get("HN_SHOTS", ROOT), f"rot-320-{scheme}.png")) if os.environ.get("HN_SHOTS") else None
        np_.evaluate("closeSheet()"); np_.wait_for_timeout(300)
        np_.evaluate("gpPasteSheet()"); np_.wait_for_timeout(400)
        np_.fill(".sheet [name=gpsrc]", ROT_SRC); np_.wait_for_timeout(200)
        wide = np_.evaluate("(() => { const s = document.querySelector('.sheet'); return [...s.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > s.getBoundingClientRect().right + 0.5 && e.getClientRects().length).map(e => e.tagName + '.' + e.className).slice(0, 3); })()")
        ok(f"2.8 linh hoạt 320 {scheme}: sheet Dán giáo án có Cách xếp buổi không tràn", not wide and "—" not in np_.inner_text(".sheet"), str(wide))
        np_.screenshot(path=os.path.join(os.environ.get("HN_SHOTS", ROOT), f"rot-paste-320-{scheme}.png"), full_page=True) if os.environ.get("HN_SHOTS") else None
        np_.context.close()
with sync_playwright() as p:
    b = p.chromium.launch()
    run28("giáo án linh hoạt", d_rot, b)
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
