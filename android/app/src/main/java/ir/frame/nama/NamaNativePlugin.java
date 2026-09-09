package ir.frame.nama;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * v0.12.0 — the Android bridge for everything the WebView cannot do:
 *
 *  - native MKV/HEVC playback with embedded Persian subtitles (Media3)
 *  - a real download engine (Range resume, pause/resume/cancel, progress
 *    events) for offline watching
 *  - in-app self-update: hot OTA web bundles (setServerBasePath, no
 *    reinstall) + cover packs; full-APK versions open in the browser
 *    (v0.17.0 — the in-app installer was removed for Play Protect)
 */
@CapacitorPlugin(name = "NamaNative")
public class NamaNativePlugin extends Plugin {

    /* ------------------------------------------------------------------ */
    /* install info                                                        */
    /* ------------------------------------------------------------------ */

    @PluginMethod
    public void getInstallInfo(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            String v = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0).versionName;
            ret.put("versionName", v);
        } catch (Exception e) {
            ret.put("versionName", "0.0.0");
        }
        ret.put("nativeRev", BuildConfig.NATIVE_REV);
        ret.put("otaVersion", prefs().getString("otaVersion", ""));
        ret.put("hasNativePlayer", true);
        // v0.16.0 — cover-pack revision this install carries: the APK baseline
        // or whatever the runtime has merged via applyCoverPack (max wins)
        ret.put("coversRev", Math.max(BuildConfig.COVERS_REV, prefs().getInt("coversAppliedRev", 0)));
        call.resolve(ret);
    }

    /* ------------------------------------------------------------------ */
    /* native player                                                       */
    /* ------------------------------------------------------------------ */

    @PluginMethod
    public void playVideo(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url required");
            return;
        }
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("title", call.getString("title", "Frame"));
        intent.putExtra("subtitle", call.getString("subtitle", ""));
        intent.putExtra("positionMs", (long) call.getInt("positionMs", 0));
        JSArray subs = call.getArray("subs");
        if (subs != null) {
            try {
                ArrayList<String> list = new ArrayList<>();
                for (int i = 0; i < subs.length(); i++) {
                    JSONObject o = subs.getJSONObject(i);
                    list.add(o.optString("path") + "\u0001" + o.optString("mime", "application/x-subrip"));
                }
                intent.putExtra("subs", list.toArray(new String[0]));
            } catch (Exception ignored) {
            }
        }
        // v0.18.0 — episodes manifest (id␁season␁number␁name␁thumb␁watched␁pct),
        // poster artwork, double-tap step and the web-variant flag: PlayerActivity
        // renders its own episodes sheet + honest cinema switch from these.
        JSArray eps = call.getArray("episodes");
        if (eps != null) {
            try {
                ArrayList<String> list = new ArrayList<>();
                for (int i = 0; i < eps.length(); i++) {
                    JSONObject o = eps.getJSONObject(i);
                    list.add(o.optInt("id") + "\u0001" + o.optInt("season")
                        + "\u0001" + o.optInt("number") + "\u0001" + o.optString("name", "")
                        + "\u0001" + o.optString("thumbnail", "") + "\u0001"
                        + (o.optBoolean("watched") ? "1" : "0") + "\u0001" + o.optInt("progressPct"));
                }
                intent.putExtra("episodes", list.toArray(new String[0]));
                intent.putExtra("episodeIndex", call.getInt("episodeIndex", 0));
            } catch (Exception ignored) {
            }
        }
        String poster = call.getString("poster");
        if (poster != null && !poster.isEmpty()) intent.putExtra("poster", poster);
        int step = call.getInt("seekStepSec", 10);
        if (step == 5 || step == 10 || step == 15 || step == 30) intent.putExtra("seekStepSec", step);
        intent.putExtra("hasWebVariant", call.getBoolean("hasWebVariant", false));
        startActivityForResult(call, intent, "playResult");
    }

    @ActivityCallback
    private void playResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        android.content.Intent data = result.getData();
        ret.put("positionMs", data != null ? data.getLongExtra("positionMs", 0L) : 0L);
        ret.put("durationMs", data != null ? data.getLongExtra("durationMs", 0L) : 0L);
        ret.put("ended", data != null && data.getBooleanExtra("ended", false));
        ret.put("error", data != null ? data.getStringExtra("error") : "");
        // v0.18.0 — episodes-sheet pick / web-variant (cinema) switch requests
        ret.put("switchToEpisodeId", data != null ? data.getIntExtra("switchToEpisodeId", 0) : 0);
        ret.put("switchToWeb", data != null && data.getBooleanExtra("switchToWeb", false));
        ret.put("suppressNext", data != null && data.getBooleanExtra("suppressNext", false));
        call.resolve(ret);
    }

    /* ------------------------------------------------------------------ */
    /* download engine                                                     */
    /* ------------------------------------------------------------------ */

    private static class Job {
        final String id;
        final String url;
        final File dest;
        volatile String status = "downloading"; // downloading | paused | done | error | canceled
        volatile long received = 0;
        volatile long total = 0;
        volatile long lastTick = 0;
        volatile long lastReceived = 0;
        volatile int errorCount = 0;

        Job(String id, String url, File dest) {
            this.id = id;
            this.url = url;
            this.dest = dest;
        }
    }

    private static final ConcurrentHashMap<String, Job> JOBS = new ConcurrentHashMap<>();

    @PluginMethod
    public void download(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        String rel = call.getString("dest");
        if (id == null || url == null || rel == null || rel.isEmpty()) {
            call.reject("id, url, dest required");
            return;
        }
        File dest = fileUnder(rel);
        Job job = new Job(id, url, dest);
        JOBS.put(id, job);
        Thread t = new Thread(() -> runJob(job));
        t.setName("nama-dl-" + id);
        t.start();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadAction(PluginCall call) {
        String id = call.getString("id");
        String action = call.getString("action", "");
        Job job = id == null ? null : JOBS.get(id);
        if (job != null) {
            if ("pause".equals(action)) job.status = "paused";
            else if ("resume".equals(action) && "paused".equals(job.status)) {
                job.status = "downloading";
                Thread t = new Thread(() -> runJob(job));
                t.setName("nama-dl-" + id);
                t.start();
            } else if ("cancel".equals(action)) {
                job.status = "canceled";
                job.dest.delete();
                JOBS.remove(id);
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private void runJob(Job job) {
        File part = new File(job.dest.getAbsolutePath() + ".part");
        while (true) {
            if ("canceled".equals(job.status)) return;
            if ("paused".equals(job.status)) {
                emit(job, "paused", 0);
                return;
            }
            try {
                File dir = job.dest.getParentFile();
                if (dir != null && !dir.exists()) dir.mkdirs();
                long already = part.exists() ? part.length() : 0;
                HttpURLConnection c = (HttpURLConnection) new URL(job.url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                if (already > 0) c.setRequestProperty("Range", "bytes=" + already + "-");
                c.setInstanceFollowRedirects(true);
                int code = c.getResponseCode();
                if (code == 416) { // range beyond end → file already complete
                    if (already > 0) {
                        if (!part.renameTo(job.dest)) part.delete();
                        job.received = already;
                        finishJob(job);
                        return;
                    }
                }
                if (code >= 300) throw new Exception("HTTP " + code);
                boolean resuming = code == 206 && already > 0;
                if (!resuming && already > 0) {
                    part.delete();
                    already = 0;
                }
                job.total = resuming ? already + c.getContentLength() : c.getContentLength();
                job.received = already;
                InputStream in = new BufferedInputStream(c.getInputStream(), 1 << 16);
                OutputStream out = new FileOutputStream(part, resuming);
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if ("canceled".equals(job.status)) {
                        out.close();
                        in.close();
                        c.disconnect();
                        part.delete();
                        return;
                    }
                    if ("paused".equals(job.status)) {
                        out.close();
                        in.close();
                        c.disconnect();
                        emit(job, "paused", 0);
                        return;
                    }
                    out.write(buf, 0, n);
                    job.received += n;
                    long now = System.currentTimeMillis();
                    if (now - job.lastTick > 500) {
                        long speed = (long) ((job.received - job.lastReceived) * 1000.0 / (now - job.lastTick));
                        job.lastTick = now;
                        job.lastReceived = job.received;
                        emit(job, "progress", speed);
                    }
                }
                out.close();
                in.close();
                c.disconnect();
                if (!part.renameTo(job.dest)) part.delete();
                finishJob(job);
                return;
            } catch (Exception e) {
                job.errorCount++;
                if (job.errorCount >= 4 || "canceled".equals(job.status)) {
                    job.status = "error";
                    emit(job, "error", 0);
                    JOBS.remove(job.id);
                    return;
                }
                try {
                    Thread.sleep(1500L * job.errorCount);
                } catch (InterruptedException ie) {
                    return;
                }
            }
        }
    }

    private void finishJob(Job job) {
        job.status = "done";
        emit(job, "done", 0);
        JOBS.remove(job.id);
    }

    private void emit(Job job, String type, long speed) {
        JSObject data = new JSObject();
        data.put("id", job.id);
        data.put("type", type);
        data.put("received", job.received);
        data.put("total", job.total);
        data.put("speed", speed);
        data.put("status", job.status);
        notifyListeners("namaDownload", data);
    }

    /* ------------------------------------------------------------------ */
    /* file helpers                                                        */
    /* ------------------------------------------------------------------ */

    private File fileUnder(String rel) {
        File f = new File(getContext().getFilesDir(), rel);
        try {
            if (!f.getCanonicalPath().startsWith(getContext().getFilesDir().getCanonicalPath())) {
                throw new SecurityException("path escape");
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return f;
    }

    @PluginMethod
    public void fileStat(PluginCall call) {
        String rel = call.getString("path", "");
        File f = fileUnder(rel);
        JSObject ret = new JSObject();
        ret.put("exists", f.exists());
        ret.put("size", f.length());
        ret.put("absPath", f.getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String rel = call.getString("path", "");
        File f = fileUnder(rel);
        deleteR(f);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private void deleteR(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteR(k);
        f.delete();
    }

    /* ------------------------------------------------------------------ */
    /* in-app self-update                                                  */
    /* ------------------------------------------------------------------ */

    /** Download any URL into the app's private storage (updater + fallbacks). */
    @PluginMethod
    public void downloadFile(PluginCall call) {
        String id = call.getString("id", "ota");
        String url = call.getString("url");
        String rel = call.getString("dest");
        if (url == null || rel == null) {
            call.reject("url, dest required");
            return;
        }
        final String jid = id;
        Job job = new Job(jid, url, fileUnder(rel));
        JOBS.put(jid, job);
        Thread t = new Thread(() -> runJob(job));
        t.setName("nama-ota-" + jid);
        t.start();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /** Unzip a downloaded web-bundle and hot-swap the WebView onto it. */
    @PluginMethod
    public void applyBundle(PluginCall call) {
        String rel = call.getString("zipPath", "");
        String version = call.getString("version", "");
        try {
            File zip = fileUnder(rel);
            if (!zip.exists()) {
                call.reject("bundle zip missing");
                return;
            }
            File otaRoot = new File(getContext().getFilesDir(), "ota");
            File target = new File(otaRoot, version.isEmpty() ? "ota-" + System.currentTimeMillis() : version);
            // v0.16.0 — the web root is replaced wholesale, but runtime-merged
            // cover packs (covers/**) must survive code OTAs: carry the dir out
            // of the previous bundle before it is deleted, tuck it back in after
            File carryCovers = new File(otaRoot, ".carry-covers");
            deleteR(carryCovers);
            File[] prevKids = otaRoot.listFiles();
            if (prevKids != null) {
                for (File k : prevKids) {
                    File cov = new File(k, "covers");
                    if (!k.equals(target) && cov.isDirectory() && !carryCovers.isDirectory()) {
                        cov.renameTo(carryCovers);
                    }
                }
            }
            if (target.exists()) deleteR(target);
            target.mkdirs();
            try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {
                ZipEntry e;
                byte[] buf = new byte[1 << 16];
                String canonicalTarget = target.getCanonicalPath() + File.separator;
                while ((e = zin.getNextEntry()) != null) {
                    File out = new File(target, e.getName());
                    if (!out.getCanonicalPath().startsWith(canonicalTarget)) continue; // zip-slip
                    if (e.isDirectory()) {
                        out.mkdirs();
                        continue;
                    }
                    File parent = out.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (OutputStream fo = new FileOutputStream(out)) {
                        int n;
                        while ((n = zin.read(buf)) > 0) fo.write(buf, 0, n);
                    }
                    zin.closeEntry();
                }
            }
            if (!new File(target, "index.html").exists()) {
                call.reject("bundle invalid (no index.html)");
                return;
            }
            // tuck the carried cover pack back into the fresh web root
            if (carryCovers.isDirectory() && !new File(target, "covers").exists()) {
                carryCovers.renameTo(new File(target, "covers"));
            }
            deleteR(carryCovers);
            zip.delete();
            // keep only the newest bundle around
            File[] kids = otaRoot.listFiles();
            if (kids != null) {
                for (File k : kids) {
                    if (!k.equals(target)) deleteR(k);
                }
            }
            prefs().edit().putString("otaVersion", version).apply();
            getBridge().setServerBasePath(target.getAbsolutePath()); // hosts + reloads
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("path", target.getAbsolutePath());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("apply failed: " + e.getMessage());
        }
    }

    /**
     * v0.16.0 — merge a downloaded covers pack (entries under covers/) into the
     * CURRENT server base dir without touching anything else. The split keeps
     * OTA code bundles small (~20MB) while the heavy poster library rides in
     * versioned packs: «فقط بخش‌هایی که تغییر کرده‌اند دانلود می‌شوند».
     * Requires a materialized web root — if the WebView still serves from APK
     * assets the call rejects with "no-webroot" and the JS side must apply the
     * code bundle first.
     */
    @PluginMethod
    public void applyCoverPack(PluginCall call) {
        String rel = call.getString("zipPath", "");
        int rev = call.getInt("rev", 0);
        try {
            File zip = fileUnder(rel);
            if (!zip.exists()) {
                call.reject("pack zip missing");
                return;
            }
            String basePath = getBridge().getServerBasePath();
            // Capacitor's default (assets mode) base path is the RELATIVE
            // "public" — a materialized web root is always an absolute dir
            if (basePath == null || !basePath.startsWith("/")) {
                call.reject("no-webroot");
                return;
            }
            File target = new File(basePath);
            if (!new File(target, "index.html").exists()) {
                call.reject("no-webroot");
                return;
            }
            int merged = 0;
            try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {
                ZipEntry e;
                byte[] buf = new byte[1 << 16];
                String canonicalTarget = target.getCanonicalPath() + File.separator;
                while ((e = zin.getNextEntry()) != null) {
                    // merge mode: only covers/** entries belong to a pack
                    if (e.getName().startsWith("covers/") && !e.isDirectory()) {
                        File out = new File(target, e.getName());
                        if (!out.getCanonicalPath().startsWith(canonicalTarget)) continue; // zip-slip
                        File parent = out.getParentFile();
                        if (parent != null) parent.mkdirs();
                        try (OutputStream fo = new FileOutputStream(out)) {
                            int n;
                            while ((n = zin.read(buf)) > 0) fo.write(buf, 0, n);
                        }
                        merged++;
                    }
                    zin.closeEntry();
                }
            }
            zip.delete();
            if (merged == 0) {
                call.reject("pack invalid (no covers entries)");
                return;
            }
            if (rev > 0) prefs().edit().putInt("coversAppliedRev", Math.max(rev, prefs().getInt("coversAppliedRev", 0))).apply();
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("merged", merged);
            ret.put("webroot", target.getAbsolutePath());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("apply failed: " + e.getMessage());
        }
    }

    /** v0.17.0 — open an https URL in the system browser. Replaces the old
     *  download-APK-and-install flow: REQUEST_INSTALL_PACKAGES +
     *  ACTION_VIEW package-archive is the classic "dropper" pattern Google
     *  Play Protect flags as harmful (red «Unsafe app blocked»). Full-APK
     *  updates now land in the browser — the user installs like the first
     *  time; the unchanged signing key makes it an in-place update. */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("https url required");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("open failed: " + e.getMessage());
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("nama_native", android.content.Context.MODE_PRIVATE);
    }
}
