package ir.dangidongi.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;

/**
 * دنگی‌دنگی — نسخه‌ی اندروید (کاملاً آفلاین).
 * اپ وبِ پوشه‌ی assets را داخل WebView اجرا می‌کند؛ داده‌ها با localStorage
 * روی خود دستگاه ذخیره می‌شوند. هیچ دسترسی‌ای (نه اینترنت، نه ذخیره‌سازی) لازم نیست.
 */
public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private static final int FILE_CHOOSER_REQUEST = 1001;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // localStorage — ذخیره‌ی داده روی گوشی
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);

        // لینک‌ها داخل همین WebView بمانند، نه مرورگر بیرونی
        webView.setWebViewClient(new WebViewClient());

        // باز شدن انتخابگر فایل برای «بازگردانی پشتیبان» (input type=file)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(
                            Intent.createChooser(intent, "انتخاب فایل پشتیبان"),
                            FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    fileChooserCallback = null;
                    return false;
                }
                return true;
            }
        });

        // بریج برای «پشتیبان‌گیری»: نوشتن فایل JSON روی دستگاه بدون نیاز به دسترسی
        webView.addJavascriptInterface(new BackupBridge(this), "AndroidBackup");

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getDataString() != null) {
                results = new Uri[]{Uri.parse(data.getDataString())};
            }
            fileChooserCallback.onReceiveValue(results);
            fileChooserCallback = null;
        }
    }

    /** ذخیره‌ی فایل پشتیبان در پوشه‌ی اختصاصی اپ — بدون هیچ دسترسی runtime. */
    static class BackupBridge {
        private final Context context;

        BackupBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean saveBackup(String json, String filename) {
            try {
                File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) {
                    dir = context.getFilesDir();
                }
                File file = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(json.getBytes("UTF-8"));
                fos.close();
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
