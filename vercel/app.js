/* =============================================================
   دنگی‌دنگی — نسخه‌ی آنلاین (ورسل)
   همگام‌سازی با polling هر ۳ ثانیه (ورسل اتصال باز SSE نمی‌پذیرد)
   ============================================================= */
(function () {
    'use strict';

    var STORAGE_KEY = 'dangidongi_online_v1';
    var POLL_MS = 3000;

    var session = null;
    var members = [];
    var lastRev = -1;
    var pollTimer = null;
    var toastTimer = null;

    function $(sel) { return document.querySelector(sel); }

    /* ------------------------------ ابزارها ------------------------------ */

    function toEnglishDigits(s) {
        return String(s)
            .replace(/[۰-۹]/g, function (c) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)); })
            .replace(/[٠-٩]/g, function (c) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)); });
    }

    function parseAmount(raw) {
        var s = toEnglishDigits(raw).replace(/[^0-9]/g, '');
        if (s === '' || s.length > 15) return null;
        var n = parseInt(s, 10);
        return (isFinite(n) && n > 0) ? n : null;
    }

    function fmtNum(n) { return Number(n).toLocaleString('fa-IR'); }
    function fmtToman(n) { return fmtNum(n) + ' تومان'; }
    function fmtSigned(n) { return (n > 0 ? '+' : '') + fmtNum(n); }

    var dateFormatter = null, timeFormatter = null;
    try {
        dateFormatter = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
        timeFormatter = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { dateFormatter = null; }

    function fmtWhen(iso) {
        if (!dateFormatter) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var s = dateFormatter.format(d);
        if (timeFormatter) s += '، ساعت ' + timeFormatter.format(d);
        return s;
    }

    /** تقسیم مبلغ — دقیقاً مثل سرور (برای پیش‌نمایش زنده). */
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
            if (shares[i].weight > 0) { shares[i].share += remainder; break; }
        }
        return shares;
    }

    function computeBalances() {
        var paid = {}, share = {};
        members.forEach(function (m) { paid[m.id] = 0; share[m.id] = 0; });
        lastExpenses.forEach(function (e) {
            paid[e.payer_id] = (paid[e.payer_id] || 0) + e.amount;
            Object.keys(e.shares || {}).forEach(function (k) {
                share[Number(k)] = (share[Number(k)] || 0) + e.shares[k];
            });
        });
        return members.map(function (m) {
            return { id: m.id, name: m.name, paid: paid[m.id] || 0, share: share[m.id] || 0, balance: (paid[m.id] || 0) - (share[m.id] || 0) };
        });
    }

    function suggestSettlement(balances) {
        var creditors = [], debtors = [];
        balances.forEach(function (b) {
            if (b.balance > 0) creditors.push({ id: b.id, val: b.balance });
            else if (b.balance < 0) debtors.push({ id: b.id, val: -b.balance });
        });
        var transfers = [];
        while (creditors.length && debtors.length) {
            creditors.sort(function (a, b) { return b.val - a.val; });
            debtors.sort(function (a, b) { return b.val - a.val; });
            var c = creditors[0], d = debtors[0];
            var amt = Math.min(c.val, d.val);
            transfers.push({ from: d.id, to: c.id, amount: amt });
            c.val -= amt; d.val -= amt;
            if (c.val === 0) creditors.shift();
            if (d.val === 0) debtors.shift();
        }
        return transfers;
    }

    function memberName(id) {
        for (var i = 0; i < members.length; i++) {
            if (members[i].id === Number(id)) return members[i].name;
        }
        return '؟';
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
            var d = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (d && d.token) return d;
        } catch (e) { /* ignore */ }
        return null;
    }
    function saveSession() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
    }
    function clearSession() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }

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

    /* ------------------------------ نماها ------------------------------ */

    function showView(name) {
        ['auth', 'home', 'add', 'report'].forEach(function (v) {
            $('#view-' + v).hidden = (v !== name);
        });
        window.scrollTo(0, 0);
    }

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
            house_name: data.house_name,
            code: data.code
        };
        saveSession();
        enterApp();
    }

    $('#form-create').addEventListener('submit', function (e) {
        e.preventDefault();
        hideError($('#auth-error'));
        api('auth', {
            method: 'POST',
            body: { action: 'create', house_name: this.house_name.value.trim(), member_name: this.member_name.value.trim() }
        }).then(onAuthSuccess).catch(function (err) { showError($('#auth-error'), err.message); });
    });

    $('#form-join').addEventListener('submit', function (e) {
        e.preventDefault();
        hideError($('#auth-error'));
        api('auth', {
            method: 'POST',
            body: {
                action: 'join',
                invite_code: toEnglishDigits(this.invite_code.value).trim().toUpperCase(),
                member_name: this.member_name.value.trim()
            }
        }).then(onAuthSuccess).catch(function (err) { showError($('#auth-error'), err.message); });
    });

    /* ------------------------------ ورود و همگام‌سازی ------------------------------ */

    var lastExpenses = [];

    function enterApp() {
        renderHouseInfo();
        showView('home');
        refresh(true);
        startPolling();
    }

    function renderHouseInfo() {
        $('#house-name').textContent = session.house_name;
        $('#invite-code').textContent = session.code;
    }

    function startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(function () { refresh(false); }, POLL_MS);
    }

    function refresh(force) {
        if (!session) return;
        api('state').then(function (data) {
            setSync('on');
            if (!force && data.rev === lastRev) return;
            lastRev = data.rev;
            members = data.members;
            lastExpenses = data.expenses;
            renderAll();
        }).catch(function (err) {
            setSync('off');
            if (force) showToastError(err);
        });
    }

    function setSync(state) {
        var el = $('#sync-status');
        if (state === 'on') {
            el.textContent = '● همگام‌سازی خودکار فعال است (هر ۳ ثانیه)';
            el.className = 'live on';
        } else {
            el.textContent = '○ ارتباط با سرور قطع شد؛ تلاش دوباره…';
            el.className = 'live off';
        }
    }

    function renderAll() {
        renderHouseInfo();
        renderBalancesStrip();
        renderExpenseList();
        if (!$('#view-report').hidden) renderReport();
    }

    /* ------------------------------ رندرها ------------------------------ */

    function renderBalancesStrip() {
        var box = $('#balances-strip');
        box.textContent = '';
        computeBalances().forEach(function (b) {
            var chip = document.createElement('div');
            chip.className = 'chip' + (b.balance > 0 ? ' creditor' : b.balance < 0 ? ' debtor' : '');
            var name = document.createElement('span');
            name.className = 'chip-name';
            name.textContent = b.name + (b.id === session.member_id ? ' (شما)' : '');
            var val = document.createElement('b');
            val.textContent = fmtSigned(b.balance);
            chip.appendChild(name);
            chip.appendChild(val);
            box.appendChild(chip);
        });
    }

    function renderExpenseList() {
        var list = $('#expense-list');
        list.textContent = '';
        var expenses = lastExpenses.slice().reverse();
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
            meta.textContent = 'پرداخت: ' + memberName(e.payer_id) + ' · ' + fmtWhen(e.created_at);
            li.appendChild(head);
            li.appendChild(meta);

            var parts = [];
            members.forEach(function (m) {
                var w = e.weights ? (e.weights[m.id] || 0) : 0;
                if (w > 0) {
                    var label = m.name;
                    if (w > 1) label += ' ×' + fmtNum(w);
                    label += ' ' + fmtNum((e.shares && e.shares[m.id]) || 0);
                    parts.push(label);
                }
            });
            if (parts.length) {
                var shares = document.createElement('div');
                shares.className = 'expense-shares';
                shares.textContent = 'سهم: ' + parts.join(' · ');
                li.appendChild(shares);
            }
            list.appendChild(li);
        });
    }

    /* ------------------------------ ثبت هزینه ------------------------------ */

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
            opt.textContent = m.name + (m.id === session.member_id ? ' (شما)' : '');
            if (m.id === session.member_id) opt.selected = true;
            payerSelect.appendChild(opt);
        });

        var weightsBox = $('#weights-list');
        weightsBox.textContent = '';
        members.forEach(function (m) {
            var row = document.createElement('div');
            row.className = 'weight-row';
            var label = document.createElement('span');
            label.className = 'weight-name';
            label.textContent = m.name + (m.id === session.member_id ? ' (شما)' : '');
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

    $('#form-expense').amount.addEventListener('input', function () {
        var cleaned = toEnglishDigits(this.value).replace(/[^0-9]/g, '');
        if (cleaned !== this.value) this.value = cleaned;
        updateSplitPreview();
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
        var payerId = Number(this.payer_member_id.value);
        var weightsArr = currentWeights();
        var weights = {};
        weightsArr.forEach(function (w) { weights[w.id] = w.weight; });

        if (!title) { showError($('#expense-error'), 'نام کالا را وارد کنید.'); return; }
        if (!amount) { showError($('#expense-error'), 'مبلغ باید عدد صحیح مثبت (تومان) باشد.'); return; }

        api('expense', {
            method: 'POST',
            body: { title: title, amount: amount, payer_member_id: payerId, weights: weights }
        }).then(function () {
            showView('home');
            refresh(true);
        }).catch(function (err) {
            showError($('#expense-error'), err.message);
        });
    });

    /* ------------------------------ گزارش ------------------------------ */

    $('#btn-open-report').addEventListener('click', function () {
        renderReport();
        showView('report');
    });

    $('#btn-report-back').addEventListener('click', function () { showView('home'); });

    function renderReport() {
        var balances = computeBalances();

        var tbody = $('#report-balances');
        tbody.textContent = '';
        balances.forEach(function (b) {
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
        var settlement = suggestSettlement(balances);
        $('#settlement-empty').hidden = settlement.length > 0;
        settlement.forEach(function (t) {
            var li = document.createElement('li');
            li.textContent = memberName(t.from) + ' باید ' + fmtToman(t.amount) + ' به ' + memberName(t.to) + ' بدهد.';
            ol.appendChild(li);
        });
    }

    /* ------------------------------ متفرقه ------------------------------ */

    $('#invite-code').addEventListener('click', function () {
        if (!session) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(session.code).then(function () {
                toast('کد دعوت کپی شد؛ برای هم‌خانه‌ای‌ها بفرستید.');
            }).catch(function () { /* ignore */ });
        }
    });

    $('#btn-logout').addEventListener('click', function () { logout(false); });

    function logout(silent) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        session = null;
        lastRev = -1;
        clearSession();
        showView('auth');
        if (!silent) toast('از خونه خارج شدید.');
    }

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && session) refresh(false);
    });

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
