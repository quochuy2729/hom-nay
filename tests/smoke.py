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
    # thư viện supabase-js từ cdn.jsdelivr.net vẫn được phép chạy dưới CSP
    ctx = b.new_context(); ctx.route("**/fonts.*/**", lambda r: r.abort())
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body="window.__cdnLoaded = true;"))
    cp = ctx.new_page(); cp.goto(f"http://127.0.0.1:{PORT}/"); cp.wait_for_timeout(400)
    ok("csp: vẫn tải được supabase-js từ cdn.jsdelivr.net", cp.evaluate("window.__cdnLoaded === true"))
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
