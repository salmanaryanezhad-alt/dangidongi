/* =============================================================
   دنگی‌دنگی — منطق فرانت‌اند (Vanilla JS)
   اتصال به API، رندر صفحه‌ها، و همگام‌سازی لحظه‌ای با SSE
   ============================================================= */
(function () {
    'use strict';

    var STORAGE_KEY = 'dangidongi_session';

    var session = null;      // {token, member_id, member_name, house_id, house_name, invite_code}
    var members = [];        // [{id, name}]
    var eventSource = null;
    var lastEventId = 0;
    var toastTimer = null;

    /* ------------------------------ ابزارها ------------------------------ */

    function $(sel) { return document.querySelector(sel); }

    /** تبدیل ارقام فارسی/عربی به لاتین برای پارس کردن. */
    function toEnglishDigits(s) {
        return String(s)
            .replace(/[۰-۹]/g, function (c) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)); })
            .replace(/[٠-٩]/g, function (c) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)); });
    }

    /** پارس مبلغ ورودی؛ فقط رقم. اگر معتبر نبود null. */
    function parseAmount(raw) {
        var s = toEnglishDigits(raw).replace(/[^0-9]/g, '');
        if (s === '' || s.length > 15) return null;
        var n = parseInt(s, 10);
        return (isFinite(n) && n > 0) ? n : null;
    }

    function fmtNum(n) { return Number(n).toLocaleString('fa-IR'); }

    function fmtToman(n) { return fmtNum(n) + ' تومان'; }

    function fmtSigned(n) { return (n > 0 ? '+' : '') + fmtNum(n); }

    /* تاریخ شمسی با Intl (تقویم فارسی پیش‌فرض fa-IR است) */
    var dateFormatter = null;
    var timeFormatter = null;
    try {
        dateFormatter = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
        timeFormatter = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        dateFormatter = null;
    }

    function fmtWhen(mysqlDatetime) {
        if (!dateFormatter) return '';
        var d = new Date(String(mysqlDatetime).replace(' ', 'T'));
        if (isNaN(d.getTime())) return '';
        var s = dateFormatter.format(d);
        if (timeFormatter) s += '، ساعت ' + timeFormatter.format(d);
        return s;
    }

    /**
     * تقسیم مبلغ با ضریب‌ها — دقیقاً مثل سرور:
     * کف (floor) برای همه، باقی‌مانده به اولین عضو با ضریب مثبت.
     * @param {number} amount
     * @param {Array<{id:number, weight:number}>} orderedWeights
     */
    function splitAmount(amount, orderedWeights) {
        var total = 0;
        orderedWeights.forEach(function (w) { total += w.weight; });
        if (total <= 0) return null;
        var remainder = amount;
        var shares = orderedWeights.map(function (w) {
            var s = Math.floor((amount * w.weight) / total);
            remainder -= s;
            return { id: w.id, weight: w.weight, share: s };
        });
        for (var i = 0; i < shares.length; i++) {
            if (shares[i].weight > 0) {
                shares[i].share += remainder;
                break;
            }
        }
        return shares;
    }

    function toast(msg) {
        var el = $('#toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2500);
    }

    function showError(el, msg) { el.textContent = msg; el.hidden = false; }
    function hideError(el) { el.hidden = true; }

    /* ------------------------------ نشست و API ------------------------------ */

    function loadSession() {
        try {
            var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (data && data.token) return data;
        } catch (e) { /* ignore */ }
        return null;
    }

    function saveSession() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
    }

    function clearSession() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }

    /** فراخوانی API؛ هدر توکن را اضافه می‌کند و در صورت 401 خارج می‌شود. */
    function api(path, options) {
        options = options || {};
        var headers = {};
        if (session) headers['X-Token'] = session.token;
        if (options.body) headers['Content-Type'] = 'application/json';
        return fetch('api/' + path, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        }).then(function (res) {
            return res.json().catch(function () { return { ok: false, error: 'پاسخ سرور معتبر نیست.' }; })
                .then(function (data) {
                    if (res.status === 401) {
                        logout(true);
                        throw new Error((data && data.error) || 'توکن معتبر نیست.');
                    }
                    if (!res.ok || !data.ok) {
                        throw new Error((data && data.error) || 'خطایی رخ داد.');
                    }
                    return data;
                });
        });
    }

    function showToastError(err) {
        if (err && err.message) toast(err.message);
    }

    /* ------------------------------ جابه‌جایی صفحه‌ها ------------------------------ */

    function showView(name) {
        ['auth', 'home', 'add', 'report'].forEach(function (v) {
            $('#view-' + v).hidden = (v !== name);
        });
        window.scrollTo(0, 0);
    }

    /* ------------------------------ ورود / ساخت خونه ------------------------------ */

    function setAuthTab(which) {
        $('#tab-create').classList.toggle('active', which === 'create');
        $('#tab-join').classList.toggle('active', which === 'join');
        $('#form-create').hidden = (which !== 'create');
        $('#form-join').hidden = (which !== 'join');
        hideError($('#auth-error'));
    }

    $('#tab-create').addEventListener('click', function () { setAuthTab('create'); });
    $('#tab-join').addEventListener('click', function () { setAuthTab('join'); });

    function onAuthSuccess(data) {
        session = {
            token: data.token,
            member_id: Number(data.member_id),
            member_name: data.member_name,
            house_id: Number(data.house_id),
            house_name: data.house_name,
            invite_code: data.invite_code
        };
        saveSession();
        enterApp();
    }

    $('#form-create').addEventListener('submit', function (e) {
        e.preventDefault();
        hideError($('#auth-error'));
        api('auth.php', {
            method: 'POST',
            body: {
                action: 'create',
                house_name: this.house_name.value.trim(),
                member_name: this.member_name.value.trim()
            }
        }).then(onAuthSuccess).catch(function (err) { showError($('#auth-error'), err.message); });
    });

    $('#form-join').addEventListener('submit', function (e) {
        e.preventDefault();
        hideError($('#auth-error'));
        api('auth.php', {
            method: 'POST',
            body: {
                action: 'join',
                invite_code: toEnglishDigits(this.invite_code.value).trim().toUpperCase(),
                member_name: this.member_name.value.trim()
            }
        }).then(onAuthSuccess).catch(function (err) { showError($('#auth-error'), err.message); });
    });

    /* ------------------------------ ورود به اپ ------------------------------ */

    function enterApp() {
        renderHouseInfo();
        showView('home');
        refreshAll();
        connectStream();
    }

    function renderHouseInfo() {
        $('#house-name').textContent = session.house_name;
        $('#invite-code').textContent = session.invite_code;
    }

    function refreshAll() {
        if (!session) return;
        api('members.php').then(function (data) {
            members = data.members;
        }).catch(showToastError);
        api('expenses.php').then(function (data) {
            renderExpenseList(data.expenses);
        }).catch(showToastError);
        api('balances.php').then(function (data) {
            renderBalancesStrip(data.balances);
            renderReport(data);
        }).catch(showToastError);
    }

    /* ------------------------------ رندر صفحه اصلی ------------------------------ */

    function renderBalancesStrip(balances) {
        var box = $('#balances-strip');
        box.textContent = '';
        balances.forEach(function (b) {
            var chip = document.createElement('div');
            chip.className = 'chip' + (b.balance > 0 ? ' creditor' : b.balance < 0 ? ' debtor' : '');

            var name = document.createElement('span');
            name.className = 'chip-name';
            name.textContent = b.name + (Number(b.member_id) === session.member_id ? ' (شما)' : '');

            var val = document.createElement('b');
            val.textContent = fmtSigned(b.balance);

            chip.appendChild(name);
            chip.appendChild(val);
            box.appendChild(chip);
        });
    }

    function renderExpenseList(expenses) {
        var list = $('#expense-list');
        list.textContent = '';
        $('#expense-empty').hidden = expenses.length > 0;

        expenses.forEach(function (e) {
            var li = document.createElement('li');
            li.className = 'expense card';

            var head = document.createElement('div');
            head.className = 'expense-head';

            var title = document.createElement('span');
            title.className = 'expense-title';
            title.textContent = e.title;

            var amount = document.createElement('span');
            amount.className = 'expense-amount';
            amount.textContent = fmtToman(e.amount);

            head.appendChild(title);
            head.appendChild(amount);

            var meta = document.createElement('div');
            meta.className = 'expense-meta';
            meta.textContent = 'پرداخت: ' + e.payer_name + ' · ' + fmtWhen(e.created_at);

            li.appendChild(head);
            li.appendChild(meta);

            var activeShares = e.shares.filter(function (s) { return s.weight > 0; });
            if (activeShares.length) {
                var shares = document.createElement('div');
                shares.className = 'expense-shares';
                shares.textContent = 'سهم: ' + activeShares.map(function (s) {
                    var label = s.member_name;
                    if (s.weight > 1) label += ' ×' + fmtNum(s.weight);
                    return label + ' ' + fmtNum(s.share);
                }).join(' · ');
                li.appendChild(shares);
            }

            list.appendChild(li);
        });
    }

    /* ------------------------------ صفحه ثبت هزینه ------------------------------ */

    $('#btn-open-add').addEventListener('click', function () {
        buildExpenseForm();
        showView('add');
    });

    $('#btn-add-back').addEventListener('click', function () { showView('home'); });

    function buildExpenseForm() {
        var payerSelect = $('#payer-select');
        payerSelect.textContent = '';
        members.forEach(function (m) {
            var opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name + (Number(m.id) === session.member_id ? ' (شما)' : '');
            if (Number(m.id) === session.member_id) opt.selected = true;
            payerSelect.appendChild(opt);
        });

        var weightsBox = $('#weights-list');
        weightsBox.textContent = '';
        members.forEach(function (m) {
            var row = document.createElement('div');
            row.className = 'weight-row';

            var label = document.createElement('span');
            label.className = 'weight-name';
            label.textContent = m.name + (Number(m.id) === session.member_id ? ' (شما)' : '');

            var input = document.createElement('input');
            input.type = 'text';
            input.value = '1';
            input.className = 'weight-input';
            input.inputMode = 'numeric';
            input.maxLength = 3;
            input.dataset.memberId = m.id;
            input.addEventListener('input', updateSplitPreview);

            row.appendChild(label);
            row.appendChild(input);
            weightsBox.appendChild(row);
        });

        $('#form-expense').title.value = '';
        $('#form-expense').amount.value = '';
        hideError($('#expense-error'));
        updateSplitPreview();
    }

    /** مبلغ فقط رقم بماند. */
    document.addEventListener('DOMContentLoaded', function () {
        var amountInput = $('#form-expense').amount;
        amountInput.addEventListener('input', function () {
            var cleaned = toEnglishDigits(this.value).replace(/[^0-9]/g, '');
            if (cleaned !== this.value) this.value = cleaned;
            updateSplitPreview();
        });
    });

    function currentWeights() {
        var inputs = document.querySelectorAll('#weights-list .weight-input');
        var out = [];
        Array.prototype.forEach.call(inputs, function (input) {
            var cleaned = toEnglishDigits(input.value).replace(/[^0-9]/g, '');
            if (cleaned !== input.value) input.value = cleaned;
            var w = parseInt(cleaned, 10);
            if (!isFinite(w) || w < 0) w = 0;
            out.push({ id: Number(input.dataset.memberId), weight: w });
        });
        return out;
    }

    /** پیش‌نمایش زنده‌ی سهم هر نفر هنگام وارد کردن مبلغ و ضریب‌ها. */
    function updateSplitPreview() {
        var preview = $('#split-preview');
        var amount = parseAmount($('#form-expense').amount.value);
        if (!amount) {
            preview.textContent = 'برای دیدن سهم هر نفر، مبلغ را وارد کنید.';
            return;
        }
        var shares = splitAmount(amount, currentWeights());
        if (!shares) {
            preview.textContent = 'مجموع ضریب‌ها باید بیشتر از صفر باشد.';
            return;
        }
        var byId = {};
        shares.forEach(function (s) { byId[s.id] = s.share; });
        preview.textContent = 'سهم هر نفر: ' + members.map(function (m) {
            return m.name + ' ' + fmtNum(byId[m.id] || 0);
        }).join(' · ');
    }

    $('#form-expense').addEventListener('submit', function (e) {
        e.preventDefault();
        hideError($('#expense-error'));

        var title = this.title.value.trim();
        var amount = parseAmount(this.amount.value);
        var payer = Number(this.payer_member_id.value);
        var weights = {};
        currentWeights().forEach(function (w) { weights[w.id] = w.weight; });

        if (!title) { showError($('#expense-error'), 'نام کالا را وارد کنید.'); return; }
        if (!amount) { showError($('#expense-error'), 'مبلغ باید عدد صحیح مثبت (تومان) باشد.'); return; }

        api('expenses.php', {
            method: 'POST',
            body: { title: title, amount: amount, payer_member_id: payer, weights: weights }
        }).then(function () {
            showView('home');
            refreshAll();
        }).catch(function (err) {
            showError($('#expense-error'), err.message);
        });
    });

    /* ------------------------------ صفحه گزارش ------------------------------ */

    $('#btn-open-report').addEventListener('click', function () {
        showView('report');
        api('balances.php').then(renderReport).catch(showToastError);
    });

    $('#btn-report-back').addEventListener('click', function () { showView('home'); });

    function renderReport(data) {
        var tbody = $('#report-balances');
        tbody.textContent = '';
        data.balances.forEach(function (b) {
            var tr = document.createElement('tr');

            [b.name, fmtNum(b.paid), fmtNum(b.share)].forEach(function (txt) {
                var td = document.createElement('td');
                td.textContent = txt;
                tr.appendChild(td);
            });

            var tdBalance = document.createElement('td');
            tdBalance.className = b.balance > 0 ? 'creditor' : b.balance < 0 ? 'debtor' : '';
            tdBalance.textContent = fmtSigned(b.balance);
            tr.appendChild(tdBalance);

            tbody.appendChild(tr);
        });

        var ol = $('#settlement-list');
        ol.textContent = '';
        $('#settlement-empty').hidden = data.settlement.length > 0;
        data.settlement.forEach(function (t) {
            var li = document.createElement('li');
            li.textContent = t.from_name + ' باید ' + fmtToman(t.amount) + ' به ' + t.to_name + ' بدهد.';
            ol.appendChild(li);
        });
    }

    /* ------------------------------ همگام‌سازی لحظه‌ای (SSE) ------------------------------ */

    function connectStream() {
        if (eventSource) { eventSource.close(); eventSource = null; }
        if (!session) return;

        // بدون پارامترِ شناسه → سرور از «همین لحظه» شروع می‌کند (تاریخچه از راه API می‌آید).
        // هنگام اتصال مجدد، خودِ مرورگر هدر Last-Event-ID را می‌فرستد.
        var url = 'api/stream.php?token=' + encodeURIComponent(session.token)
                + (lastEventId ? '&last_event_id=' + lastEventId : '');
        eventSource = new EventSource(url);

        eventSource.onopen = function () { setLive('on'); };
        eventSource.onerror = function () { setLive('off'); };
        eventSource.onmessage = function (ev) {
            if (ev.lastEventId) {
                var id = Number(ev.lastEventId);
                if (id > 0) lastEventId = id;
            }
            refreshAll();
        };
    }

    function setLive(state) {
        var el = $('#live-status');
        if (state === 'on') {
            el.textContent = '● همگام‌سازی لحظه‌ای فعال است';
            el.className = 'live on';
        } else {
            el.textContent = '○ اتصال لحظه‌ای قطع شد؛ در حال تلاش دوباره…';
            el.className = 'live off';
        }
    }

    /* ------------------------------ متفرقه ------------------------------ */

    $('#invite-code').addEventListener('click', function () {
        if (!session) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(session.invite_code).then(function () {
                toast('کد دعوت کپی شد؛ آن را برای هم‌خانه‌ای‌ها بفرستید.');
            }).catch(function () { /* ignore */ });
        }
    });

    $('#btn-logout').addEventListener('click', function () { logout(false); });

    function logout(silent) {
        if (eventSource) { eventSource.close(); eventSource = null; }
        session = null;
        clearSession();
        showView('auth');
        if (!silent) toast('از خونه خارج شدید.');
    }

    /* ------------------------------ شروع ------------------------------ */

    function init() {
        var saved = loadSession();
        if (saved) {
            session = saved;
            enterApp();
        } else {
            showView('auth');
        }
    }

    init();
})();
