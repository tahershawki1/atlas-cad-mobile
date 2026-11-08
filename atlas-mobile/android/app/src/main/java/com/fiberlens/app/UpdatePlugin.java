package com.fiberlens.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * ATLAS CAD self-update bridge (GitHub Releases APK):
 *  - download: stream the APK to files/updates with progress events
 *  - openInstaller: ACTION_VIEW with the FileProvider URI (system installer,
 *    user confirms — Android has no silent install for normal apps)
 */
@CapacitorPlugin(name = "UpdatePlugin")
public class UpdatePlugin extends Plugin {

    @PluginMethod
    public void getVersionCode(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject o = new JSObject();
            o.put("versionName", pi.versionName);
            o.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getVersionCode() : pi.versionCode);
            call.resolve(o);
        } catch (Exception e) {
            call.reject("Cannot read version: " + e.getMessage());
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName");
        if (url == null || fileName == null) { call.reject("url and fileName required"); return; }
        final String u = url, f = fileName;
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File dir = new File(getContext().getFilesDir(), "updates");
                if (!dir.exists()) dir.mkdirs();
                File out = new File(dir, f.replaceAll("[^A-Za-z0-9._-]", "_"));
                conn = (HttpURLConnection) new URL(u).openConnection();
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                int code = conn.getResponseCode();
                if (code != 200) throw new Exception("HTTP " + code);
                long total = conn.getContentLengthLong();
                InputStream in = new BufferedInputStream(conn.getInputStream());
                FileOutputStream fos = new FileOutputStream(out);
                byte[] buf = new byte[8192];
                long received = 0;
                int n;
                long lastEmit = 0;
                while ((n = in.read(buf)) != -1) {
                    fos.write(buf, 0, n);
                    received += n;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit > 200 || received == total) {
                        lastEmit = now;
                        final long r = received, t = total;
                        new Handler(Looper.getMainLooper()).post(() -> {
                            JSObject ev = new JSObject();
                            ev.put("received", r);
                            ev.put("total", t);
                            notifyListeners("downloadProgress", ev);
                        });
                    }
                }
                fos.close();
                if (total > 0 && received != total) throw new Exception("Incomplete download");
                String uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out).toString();
                final String uriStr = uri;
                final long size = out.length();
                new Handler(Looper.getMainLooper()).post(() -> {
                    JSObject o = new JSObject();
                    o.put("filePath", out.getAbsolutePath());
                    o.put("uri", uriStr);
                    o.put("size", size);
                    call.resolve(o);
                });
            } catch (Exception e) {
                final String msg = e.getMessage();
                new Handler(Looper.getMainLooper()).post(() -> call.reject("Download failed: " + msg));
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void openInstaller(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("uri required"); return; }
        try {
            Uri uri = Uri.parse(uriStr);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open installer: " + e.getMessage());
        }
    }
}
