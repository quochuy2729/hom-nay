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
        ok(f"g4 {w}px: form chi tiêu gom ngày vào Thêm chi tiết", fp.locator(".sheet details.more:not([open]) [name=date]").count() == 1)
        grid = fp.evaluate("""() => { const g = document.querySelector('.sheet .catgrid'); if (!g) return null;
            const btns = [...g.querySelectorAll('button[data-v]')], gr = g.getBoundingClientRect();
            return { cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, minH: Math.min(...btns.map(x => x.getBoundingClientRect().height)),
                     fit: btns.every(x => { const r = x.getBoundingClientRect(); return r.left >= gr.left - 0.5 && r.right <= gr.right + 0.5 && x.scrollWidth <= x.clientWidth + 1; }), over: g.scrollWidth > g.clientWidth }; }""")
        ok(f"g4 {w}px: danh mục chi tiêu là lưới 4 cột, vừa khung, ô cao >= 44px", grid and grid["cols"] == 4 and grid["fit"] and not grid["over"] and grid["minH"] >= 44, str(grid))
        fp.fill(".sheet [name=amount]", "35"); fp.click(".sheet .catgrid [data-v=nuoc]"); fp.click(".sheet [data-save]"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: lưu khoản chi với danh mục chọn từ lưới", fp.evaluate("all('tx').some(r => r.data.amount === 35000 && r.data.cat === 'nuoc' && r.data.date === '2026-10-18')"))
        old = fp.evaluate("put('tx', { type: 'out', amount: 1000, cat: 'an', note: 'cũ', date: '2026-10-02', at: 1 }).id")
        fp.evaluate(f"txForm('{old}')"); fp.wait_for_timeout(400)
        ok(f"g4 {w}px: sửa khoản ngày khác hôm nay thì mở sẵn ô ngày", fp.locator(".sheet details.more[open] [name=date]").count() == 1)
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
