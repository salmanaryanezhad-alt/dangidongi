import { useEffect, useMemo, useRef, useState } from 'react';
import {
    toEnglishDigits, parseAmount, fmtNum, fmtToman, fmtSigned, fmtWhen,
    splitAmount, computeBalances, suggestSettlement,
} from '../lib/calc';

const STORAGE_KEY = 'dangidongi_next_v1';
const POLL_MS = 3000;

export default function Home() {
    const [booted, setBooted] = useState(false);
    const [session, setSession] = useState(null);
    const [view, setView] = useState('home');
    const [tab, setTab] = useState('create');

    const [members, setMembers] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [syncOn, setSyncOn] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);

    const [authError, setAuthError] = useState('');
    const [expenseError, setExpenseError] = useState('');
    const [toastMsg, setToastMsg] = useState('');
    const toastTimer = useRef(null);
    const revRef = useRef(-1);

    // فرم ورود / ساخت
    const [houseName, setHouseName] = useState('');
    const [myName, setMyName] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [joinName, setJoinName] = useState('');

    // فرم ثبت هزینه
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [payer, setPayer] = useState(0);
    const [weights, setWeights] = useState({});

    function showToast(msg) {
        setToastMsg(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(''), 2500);
    }

    function persistSession(s) {
        try {
            if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
            else localStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* ignore */ }
    }

    useEffect(() => {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* ignore */ }
        if (saved && saved.token) setSession(saved);
        setBooted(true);
    }, []);

    function logout(silent) {
        persistSession(null);
        revRef.current = -1;
        setSession(null);
        setMembers([]);
        setExpenses([]);
        setView('home');
        if (!silent) showToast('از خونه خارج شدید.');
    }

    /* همگام‌سازی: polling هر ۳ ثانیه */
    useEffect(() => {
        if (!session) return;
        let stop = false;
        async function load(force) {
            try {
                const res = await fetch('/api/state', { headers: { 'X-Token': session.token } });
                const data = await res.json();
                if (stop) return;
                if (res.status === 401) { logout(true); return; }
                if (!data.ok) {
                    setSyncOn(false);
                    if (force) showToast(data.error || 'خطایی رخ داد.');
                    return;
                }
                setSyncOn(true);
                if (force || data.rev !== revRef.current) {
                    revRef.current = data.rev;
                    setMembers(data.members);
                    setExpenses(data.expenses);
                }
            } catch (e) {
                if (!stop) setSyncOn(false);
            }
        }
        load(true);
        const t = setInterval(() => load(false), POLL_MS);
        return () => { stop = true; clearInterval(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, reloadTick]);

    /* مقداردهی فرم ثبت هزینه هنگام ورود به نما */
    useEffect(() => {
        if (view === 'add' && session && members.length) {
            setTitle('');
            setAmount('');
            setExpenseError('');
            setPayer(session.member_id);
            const w = {};
            members.forEach((m) => { w[m.id] = 1; });
            setWeights(w);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view]);

    function onAuth(data) {
        const s = {
            token: data.token,
            member_id: Number(data.member_id),
            member_name: data.member_name,
            house_name: data.house_name,
            code: data.code,
        };
        persistSession(s);
        setSession(s);
        setView('home');
    }

    async function submitCreate(e) {
        e.preventDefault();
        setAuthError('');
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', house_name: houseName.trim(), member_name: myName.trim() }),
            });
            const data = await res.json();
            if (!data.ok) { setAuthError(data.error || 'خطا'); return; }
            onAuth(data);
        } catch (er) { setAuthError('خطا در ارتباط با سرور.'); }
    }

    async function submitJoin(e) {
        e.preventDefault();
        setAuthError('');
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'join',
                    invite_code: toEnglishDigits(inviteCode).trim().toUpperCase(),
                    member_name: joinName.trim(),
                }),
            });
            const data = await res.json();
            if (!data.ok) { setAuthError(data.error || 'خطا'); return; }
            onAuth(data);
        } catch (er) { setAuthError('خطا در ارتباط با سرور.'); }
    }

    function onAmountChange(e) {
        const cleaned = toEnglishDigits(e.target.value).replace(/[^0-9]/g, '');
        setAmount(cleaned);
    }

    function onWeightChange(id, raw) {
        const cleaned = toEnglishDigits(raw).replace(/[^0-9]/g, '');
        const w = cleaned === '' ? 0 : parseInt(cleaned, 10);
        setWeights((old) => {
            const next = Object.assign({}, old);
            next[id] = isFinite(w) && w >= 0 ? w : 0;
            return next;
        });
    }

    async function submitExpense(e) {
        e.preventDefault();
        setExpenseError('');
        const t = title.trim();
        const amt = parseAmount(amount);
        if (!t) { setExpenseError('نام کالا را وارد کنید.'); return; }
        if (!amt) { setExpenseError('مبلغ باید عدد صحیح مثبت (تومان) باشد.'); return; }
        const w = {};
        members.forEach((m) => { w[m.id] = weights[m.id] || 0; });
        try {
            const res = await fetch('/api/expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Token': session.token },
                body: JSON.stringify({ title: t, amount: amt, payer_member_id: payer, weights: w }),
            });
            const data = await res.json();
            if (!data.ok) { setExpenseError(data.error || 'خطا'); return; }
            setView('home');
            setReloadTick((x) => x + 1);
        } catch (er) { setExpenseError('خطا در ارتباط با سرور.'); }
    }

    function copyCode() {
        if (!session) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(session.code)
                .then(() => showToast('کد دعوت کپی شد؛ برای هم‌خانه‌ای‌ها بفرستید.'))
                .catch(() => { /* ignore */ });
        }
    }

    function memberName(id) {
        const m = members.find((x) => x.id === Number(id));
        return m ? m.name : '؟';
    }

    const balances = useMemo(() => computeBalances(members, expenses), [members, expenses]);
    const settlement = useMemo(() => suggestSettlement(balances), [balances]);

    const parsedAmount = parseAmount(amount);
    let previewText = 'برای دیدن سهم هر نفر، مبلغ را وارد کنید.';
    if (view === 'add' && parsedAmount) {
        const sh = splitAmount(parsedAmount, members.map((m) => ({ id: m.id, weight: weights[m.id] || 0 })));
        if (!sh) {
            previewText = 'مجموع ضریب‌ها باید بیشتر از صفر باشد.';
        } else {
            previewText = 'سهم هر نفر: ' + members.map((m) => {
                const f = sh.find((x) => x.id === m.id);
                return m.name + ' ' + fmtNum(f ? f.share : 0);
            }).join(' · ');
        }
    }

    function shareParts(e) {
        const parts = [];
        members.forEach((m) => {
            const w = e.weights ? (e.weights[m.id] || 0) : 0;
            if (w > 0) {
                let label = m.name;
                if (w > 1) label += ' ×' + fmtNum(w);
                label += ' ' + fmtNum((e.shares && e.shares[m.id]) || 0);
                parts.push(label);
            }
        });
        return parts;
    }

    if (!booted) return null;

    return (
        <main className="container">

            {!session && (
                <section>
                    <h1>دنگی‌دنگی</h1>
                    <p className="subtitle">مدیریت خرج مشترک خونه، بدون اکسل</p>

                    <div className="tabs">
                        <button type="button" className={tab === 'create' ? 'tab active' : 'tab'}
                            onClick={() => { setTab('create'); setAuthError(''); }}>ساخت خونه</button>
                        <button type="button" className={tab === 'join' ? 'tab active' : 'tab'}
                            onClick={() => { setTab('join'); setAuthError(''); }}>ورود با کد دعوت</button>
                    </div>

                    {tab === 'create' ? (
                        <form className="card form" onSubmit={submitCreate}>
                            <label>اسم خونه
                                <input value={houseName} onChange={(e) => setHouseName(e.target.value)} required maxLength={50} placeholder="مثلاً: خونه‌ی بچه‌ها" />
                            </label>
                            <label>اسم خودت
                                <input value={myName} onChange={(e) => setMyName(e.target.value)} required maxLength={50} placeholder="مثلاً: سارا" />
                            </label>
                            <button className="btn primary" type="submit">ساخت خونه</button>
                        </form>
                    ) : (
                        <form className="card form" onSubmit={submitJoin}>
                            <label>کد دعوت
                                <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required maxLength={10} placeholder="مثلاً: AB3K9Z" />
                            </label>
                            <label>اسم خودت
                                <input value={joinName} onChange={(e) => setJoinName(e.target.value)} required maxLength={50} placeholder="مثلاً: علی" />
                            </label>
                            <button className="btn primary" type="submit">ورود به خونه</button>
                        </form>
                    )}

                    {authError && <p className="error">{authError}</p>}
                </section>
            )}

            {session && view === 'home' && (
                <section>
                    <header className="topbar">
                        <div>
                            <h2>{session.house_name}</h2>
                            <p className="invite">کد دعوت: <b onClick={copyCode} title="برای کپی کلیک کنید">{session.code}</b></p>
                        </div>
                        <button type="button" className="btn ghost small" onClick={() => logout(false)}>خروج</button>
                    </header>

                    <section className="card">
                        <h3 className="card-title">اعضا</h3>
                        <div className="chips">
                            {members.map((m) => (
                                <span key={m.id} className="member-chip">
                                    {m.name}{m.id === session.member_id ? ' (شما)' : ''}
                                </span>
                            ))}
                        </div>
                    </section>

                    <section className="card" style={{ marginTop: '10px' }}>
                        <h3 className="card-title">تراز اعضا</h3>
                        <div className="chips">
                            {balances.map((b) => (
                                <div key={b.id} className={'chip' + (b.balance > 0 ? ' creditor' : b.balance < 0 ? ' debtor' : '')}>
                                    <span className="chip-name">{b.name}{b.id === session.member_id ? ' (شما)' : ''}</span>
                                    <b>{fmtSigned(b.balance)}</b>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="actions">
                        <button type="button" className="btn primary" onClick={() => setView('add')}>+ ثبت هزینه</button>
                        <button type="button" className="btn" onClick={() => setView('report')}>گزارش و تسویه</button>
                    </div>

                    <h3>هزینه‌ها</h3>
                    <ul className="expense-list">
                        {expenses.slice().reverse().map((e) => (
                            <li key={e.id} className="expense card">
                                <div className="expense-head">
                                    <span className="expense-title">{e.title}</span>
                                    <span className="expense-amount">{fmtToman(e.amount)}</span>
                                </div>
                                <div className="expense-meta">پرداخت: {memberName(e.payer_id)} · {fmtWhen(e.created_at)}</div>
                                {shareParts(e).length > 0 && (
                                    <div className="expense-shares">سهم: {shareParts(e).join(' · ')}</div>
                                )}
                            </li>
                        ))}
                    </ul>
                    {expenses.length === 0 && <p className="empty">هنوز هزینه‌ای ثبت نشده.</p>}

                    <p className={syncOn ? 'live on' : 'live off'}>
                        {syncOn ? '● همگام‌سازی خودکار فعال است (هر ۳ ثانیه)' : '○ ارتباط با سرور قطع شد؛ تلاش دوباره…'}
                    </p>
                    <p className="hint">بقیه‌ی هم‌خانه‌ای‌ها با کد دعوت بالا از گوشی خودشون وصل می‌شن و همه‌چیز رو هم‌زمان می‌بینن.</p>
                </section>
            )}

            {session && view === 'add' && (
                <section>
                    <header className="topbar">
                        <h2>ثبت هزینه</h2>
                        <button type="button" className="btn ghost small" onClick={() => setView('home')}>بازگشت</button>
                    </header>

                    <form className="card form" onSubmit={submitExpense}>
                        <label>نام کالا
                            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={100} placeholder="مثلاً: خرید سوپرمارکت" />
                        </label>
                        <label>مبلغ (تومان)
                            <input value={amount} onChange={onAmountChange} required inputMode="numeric" maxLength={15} placeholder="مثلاً: 450000" />
                        </label>
                        <label>پرداخت‌کننده
                            <select value={payer} onChange={(e) => setPayer(Number(e.target.value))}>
                                {members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.name}{m.id === session.member_id ? ' (شما)' : ''}</option>
                                ))}
                            </select>
                        </label>

                        <fieldset>
                            <legend>ضریب سهم هر عضو (۰ = سهیم نیست، ۱ = سهم کامل، بیشتر = سهم بیشتر)</legend>
                            {members.map((m) => (
                                <div key={m.id} className="weight-row">
                                    <span className="weight-name">{m.name}{m.id === session.member_id ? ' (شما)' : ''}</span>
                                    <input className="weight-input" type="text" inputMode="numeric" maxLength={3}
                                        value={String(weights[m.id] === undefined ? 1 : weights[m.id])}
                                        onChange={(e) => onWeightChange(m.id, e.target.value)} />
                                </div>
                            ))}
                        </fieldset>

                        <p className="split-preview">{previewText}</p>
                        <button className="btn primary" type="submit">ثبت هزینه</button>
                        {expenseError && <p className="error">{expenseError}</p>}
                    </form>
                </section>
            )}

            {session && view === 'report' && (
                <section>
                    <header className="topbar">
                        <h2>گزارش و تسویه</h2>
                        <button type="button" className="btn ghost small" onClick={() => setView('home')}>بازگشت</button>
                    </header>

                    <section className="card">
                        <h3 className="card-title">تراز اعضا</h3>
                        <table className="report-table">
                            <thead>
                                <tr><th>عضو</th><th>پرداختی</th><th>سهم</th><th>تراز</th></tr>
                            </thead>
                            <tbody>
                                {balances.map((b) => (
                                    <tr key={b.id}>
                                        <td>{b.name}</td>
                                        <td>{fmtNum(b.paid)}</td>
                                        <td>{fmtNum(b.share)}</td>
                                        <td className={b.balance > 0 ? 'creditor' : b.balance < 0 ? 'debtor' : ''}>{fmtSigned(b.balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section className="card settle-card">
                        <h3 className="card-title">تسویه پیشنهادی</h3>
                        <ol className="settle-list">
                            {settlement.map((t, i) => (
                                <li key={i}>{memberName(t.from)} باید {fmtToman(t.amount)} به {memberName(t.to)} بدهد.</li>
                            ))}
                        </ol>
                        {settlement.length === 0 && <p className="empty">همه‌ی ترازها صفر است؛ چیزی برای تسویه نیست.</p>}
                    </section>
                </section>
            )}

            <div className={toastMsg ? 'toast show' : 'toast'} role="status">{toastMsg}</div>
        </main>
    );
}
