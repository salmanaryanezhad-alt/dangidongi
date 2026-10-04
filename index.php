<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0f766e">
    <title>دنگی‌دنگی — مدیریت خرج مشترک خونه</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>

<main class="container">

    <!-- ==================== صفحه ۱: ورود / ساخت خونه ==================== -->
    <section id="view-auth" class="view" hidden>
        <h1>دنگی‌دنگی</h1>
        <p class="subtitle">مدیریت خرج مشترک خونه، بدون اکسل</p>

        <div class="tabs">
            <button type="button" id="tab-create" class="tab active">ساخت خونه</button>
            <button type="button" id="tab-join" class="tab">ورود با کد دعوت</button>
        </div>

        <form id="form-create" class="card form">
            <label>اسم خونه
                <input name="house_name" required maxlength="50" placeholder="مثلاً: خونه‌ی بچه‌ها">
            </label>
            <label>اسم خودت
                <input name="member_name" required maxlength="50" placeholder="مثلاً: سارا">
            </label>
            <button class="btn primary" type="submit">ساخت خونه</button>
        </form>

        <form id="form-join" class="card form" hidden>
            <label>کد دعوت
                <input name="invite_code" required maxlength="10" placeholder="مثلاً: AB3K9Z">
            </label>
            <label>اسم خودت
                <input name="member_name" required maxlength="50" placeholder="مثلاً: علی">
            </label>
            <button class="btn primary" type="submit">ورود به خونه</button>
        </form>

        <p id="auth-error" class="error" hidden></p>
    </section>

    <!-- ==================== صفحه ۲: صفحه اصلی ==================== -->
    <section id="view-home" class="view" hidden>
        <header class="topbar">
            <div>
                <h2 id="house-name"></h2>
                <p class="invite">کد دعوت: <b id="invite-code" title="برای کپی کلیک کنید"></b></p>
            </div>
            <button type="button" id="btn-logout" class="btn ghost small">خروج</button>
        </header>

        <section class="card">
            <h3 class="card-title">تراز اعضا</h3>
            <div id="balances-strip" class="chips"></div>
        </section>

        <div class="actions">
            <button type="button" id="btn-open-add" class="btn primary">+ ثبت هزینه</button>
            <button type="button" id="btn-open-report" class="btn">گزارش و تسویه</button>
        </div>

        <h3>هزینه‌ها</h3>
        <ul id="expense-list" class="expense-list"></ul>
        <p id="expense-empty" class="empty" hidden>هنوز هزینه‌ای ثبت نشده.</p>

        <p id="live-status" class="live"></p>
    </section>

    <!-- ==================== صفحه ۳: ثبت هزینه ==================== -->
    <section id="view-add" class="view" hidden>
        <header class="topbar">
            <h2>ثبت هزینه</h2>
            <button type="button" id="btn-add-back" class="btn ghost small">بازگشت</button>
        </header>

        <form id="form-expense" class="card form">
            <label>نام کالا
                <input name="title" required maxlength="100" placeholder="مثلاً: خرید سوپرمارکت">
            </label>
            <label>مبلغ (تومان)
                <input name="amount" required inputmode="numeric" maxlength="15" placeholder="مثلاً: 450000">
            </label>
            <label>پرداخت‌کننده
                <select name="payer_member_id" id="payer-select"></select>
            </label>

            <fieldset>
                <legend>ضریب سهم هر عضو (۰ = سهیم نیست، ۱ = سهم کامل، بیشتر = سهم بیشتر)</legend>
                <div id="weights-list"></div>
            </fieldset>

            <p id="split-preview" class="split-preview">برای دیدن سهم هر نفر، مبلغ را وارد کنید.</p>
            <button class="btn primary" type="submit">ثبت هزینه</button>
            <p id="expense-error" class="error" hidden></p>
        </form>
    </section>

    <!-- ==================== صفحه ۴: گزارش و تسویه ==================== -->
    <section id="view-report" class="view" hidden>
        <header class="topbar">
            <h2>گزارش و تسویه</h2>
            <button type="button" id="btn-report-back" class="btn ghost small">بازگشت</button>
        </header>

        <section class="card">
            <h3 class="card-title">تراز اعضا</h3>
            <table class="report-table">
                <thead>
                    <tr><th>عضو</th><th>پرداختی</th><th>سهم</th><th>تراز</th></tr>
                </thead>
                <tbody id="report-balances"></tbody>
            </table>
        </section>

        <section class="card settle-card">
            <h3 class="card-title">تسویه پیشنهادی</h3>
            <ol id="settlement-list"></ol>
            <p id="settlement-empty" class="empty" hidden>همه‌ی ترازها صفر است؛ چیزی برای تسویه نیست.</p>
        </section>
    </section>

</main>

<div id="toast" role="status"></div>
<noscript><p style="text-align:center;padding:20px">برای استفاده از دنگی‌دنگی، جاوااسکریپت مرورگر را فعال کنید.</p></noscript>
<script src="assets/app.js"></script>
</body>
</html>
