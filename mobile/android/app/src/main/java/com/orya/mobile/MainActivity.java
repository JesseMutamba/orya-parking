package com.orya.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** Native shell only. Orya's server remains authoritative for all parking actions. */
public final class MainActivity extends Activity {
    private WebView web;
    private LinearLayout errorPanel;
    private PermissionRequest cameraRequest;
    private Dialog ticketDialog;
    private static final int CAMERA_REQUEST = 41;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        LinearLayout root = vertical();
        root.setBackgroundColor(Color.rgb(242, 246, 245));
        setContentView(root);
        applyInsets(root);
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(16), dp(4), dp(10), dp(4));
        TextView badge = new TextView(this);
        badge.setText(R.string.beta); badge.setTextColor(Color.rgb(9, 30, 38)); badge.setTextSize(12);
        toolbar.addView(badge, new LinearLayout.LayoutParams(0, -2, 1));
        Button reload = button(R.string.reload);
        reload.setOnClickListener(v -> loadHome()); toolbar.addView(reload);
        root.addView(toolbar);
        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this); configure(web);
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        errorPanel = vertical();
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(28), dp(24), dp(28), dp(24));
        errorPanel.setBackgroundColor(Color.rgb(242, 246, 245));
        TextView error = new TextView(this); error.setText(R.string.offline);
        error.setGravity(Gravity.CENTER); error.setTextSize(17);
        Button retry = button(R.string.retry); retry.setOnClickListener(v -> loadHome());
        errorPanel.addView(error); errorPanel.addView(retry);
        content.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                if (OriginPolicy.appPage(url, BuildConfig.APP_PATH)) return false;
                if (OriginPolicy.ticket(url, BuildConfig.OPERATIONS)) { showTicket(url); return true; }
                if (request.hasGesture()) openExternal(url);
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) errorPanel.setVisibility(View.VISIBLE);
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) errorPanel.setVisibility(View.VISIBLE);
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel(); errorPanel.setVisibility(View.VISIBLE);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                if (!OriginPolicy.appPage(url, BuildConfig.APP_PATH)) { result.cancel(); return true; }
                new AlertDialog.Builder(MainActivity.this).setTitle(R.string.app_name).setMessage(message)
                    .setPositiveButton(R.string.confirm, (dialog, which) -> result.confirm())
                    .setNegativeButton(R.string.cancel, (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> requestCamera(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (cameraRequest == request) cameraRequest = null;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message message) {
                WebView.HitTestResult hit = view.getHitTestResult();
                if (userGesture && hit != null && OriginPolicy.externalHttps(hit.getExtra())) {
                    openExternal(hit.getExtra()); return false;
                }
                if (!BuildConfig.OPERATIONS || !userGesture || ticketDialog != null) return false;
                WebView popup = createTicketPreview();
                ((WebView.WebViewTransport) message.obj).setWebView(popup);
                message.sendToTarget(); return true;
            }
        });
        loadHome();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
    }

    @SuppressLint("SetJavaScriptEnabled") private void configure(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setDownloadListener((url, agent, disposition, mime, size) ->
            Toast.makeText(this, R.string.download_unavailable, Toast.LENGTH_LONG).show());
        // No addJavascriptInterface: pages cannot read native credentials or files.
    }

    private void loadHome() {
        errorPanel.setVisibility(View.GONE);
        web.loadUrl(OriginPolicy.ORIGIN + BuildConfig.APP_PATH);
    }
    private void openExternal(String url) {
        if (!OriginPolicy.externalHttps(url)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (ActivityNotFoundException e) { Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show(); }
    }
    private boolean canRequestCamera(PermissionRequest request) {
        String[] resources = request.getResources();
        return BuildConfig.OPERATIONS && OriginPolicy.sameOrigin(request.getOrigin().toString())
            && OriginPolicy.appPage(web.getUrl(), BuildConfig.APP_PATH)
            && resources.length == 1 && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
    }
    private void requestCamera(PermissionRequest request) {
        if (!canRequestCamera(request) || cameraRequest != null) { request.deny(); return; }
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}); return;
        }
        cameraRequest = request;
        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == CAMERA_REQUEST && cameraRequest != null) {
            PermissionRequest request = cameraRequest; cameraRequest = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED && canRequestCamera(request))
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else request.deny();
        }
    }

    private void showTicket(String url) {
        if (!OriginPolicy.ticket(url, BuildConfig.OPERATIONS) || ticketDialog != null) return;
        createTicketPreview().loadUrl(url);
    }
    private WebView createTicketPreview() {
        Dialog dialog = new Dialog(this); ticketDialog = dialog;
        dialog.setTitle(R.string.ticket);
        LinearLayout root = vertical();
        LinearLayout toolbar = new LinearLayout(this);
        Button done = button(R.string.done), print = button(R.string.print);
        print.setEnabled(false);
        toolbar.addView(done); toolbar.addView(print); root.addView(toolbar);
        TextView unavailable = new TextView(this); unavailable.setText(R.string.ticket_unavailable);
        unavailable.setPadding(dp(20), dp(20), dp(20), dp(20)); unavailable.setVisibility(View.GONE);
        root.addView(unavailable);
        WebView preview = new WebView(this); configure(preview);
        root.addView(preview, new LinearLayout.LayoutParams(-1, 0, 1));
        boolean[] failed = {false};
        preview.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && !OriginPolicy.ticket(request.getUrl().toString(), BuildConfig.OPERATIONS)
                    && !"about:blank".equals(request.getUrl().toString());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                failed[0] = false; print.setEnabled(false); unavailable.setVisibility(View.GONE);
            }
            private void fail() { failed[0] = true; print.setEnabled(false); unavailable.setVisibility(View.VISIBLE); }
            @Override public void onPageFinished(WebView view, String url) {
                print.setEnabled(!failed[0] && OriginPolicy.ticket(url, BuildConfig.OPERATIONS));
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) fail();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) fail();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); fail(); }
        });
        preview.setWebChromeClient(new WebChromeClient() {
            @Override public void onCloseWindow(WebView window) { dialog.dismiss(); }
        });
        done.setOnClickListener(v -> dialog.dismiss());
        print.setOnClickListener(v -> {
            if (!print.isEnabled() || !OriginPolicy.ticket(preview.getUrl(), BuildConfig.OPERATIONS)) return;
            PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
            if (manager != null) manager.print(getString(R.string.ticket),
                preview.createPrintDocumentAdapter(getString(R.string.ticket)), new PrintAttributes.Builder().build());
        });
        dialog.setContentView(root);
        dialog.setOnDismissListener(d -> { preview.stopLoading(); preview.destroy(); ticketDialog = null; });
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT);
        }
        applyInsets(root);
        return preview;
    }
    private LinearLayout vertical() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view; }
    private Button button(int text) { Button button = new Button(this); button.setText(text); return button; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void applyInsets(View root) {
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets space = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(space.left, space.top, space.right, space.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
    }
    private void goBack() {
        if (ticketDialog != null) ticketDialog.dismiss();
        else if (web.canGoBack()) web.goBack();
        else finish();
    }
    // Legacy hardware/system back on API 26-32. API 33+ uses the registered
    // OnBackInvokedCallback above, including predictive back on API 36+.
    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation") @Override public void onBackPressed() { goBack(); }
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (cameraRequest != null) { cameraRequest.deny(); cameraRequest = null; }
        if (ticketDialog != null) ticketDialog.dismiss();
        if (web != null) { web.stopLoading(); web.destroy(); }
        super.onDestroy();
    }
}
