package ir.frame.nama;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * v0.29.0 (NEW-MOB-4) — the download engine used to run on BARE Threads:
 * on Android 8+ the process freezes in the background the moment the user
 * leaves the app, every download stalls silently, and there was no
 * notification explaining why. This lightweight foreground service keeps
 * the process alive (foregroundServiceType="dataSync") while jobs are
 * running, holds a partial wake lock so the CPU keeps writing with the
 * screen off, and shows a progress notification the plugin can update.
 *
 * Lifecycle: the plugin STARTS it whenever a job begins and STOPS it when
 * the last live job ends (see NamaNativePlugin.maybeStopForeground).
 */
public class NamaDownloadService extends Service {

    public static final String CHANNEL_ID = "nama_downloads";
    public static final int NOTIF_ID = 41;
    private static final String ACTION_STOP = "ir.frame.nama.DOWNLOAD_SERVICE_STOP";

    private PowerManager.WakeLock wakeLock;
    private static volatile boolean running = false;
    private static volatile long lastNotifUpdate = 0;

    public static void start(Context ctx) {
        try {
            Intent i = new Intent(ctx, NamaDownloadService.class);
            if (Build.VERSION.SDK_INT >= 26) ContextCompat.startForegroundService(ctx, i);
            else ctx.startService(i);
            running = true;
        } catch (Exception ignored) {
            /* app in background state that forbids service start — downloads
               continue the old way; nothing we can do from here */
        }
    }

    public static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, NamaDownloadService.class));
        } catch (Exception ignored) {
        }
        running = false;
    }

    public static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "دانلودها", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification n = buildNotification("دانلود در جریان…", 0, 0);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, n);
        }
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Frame:downloads");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(4 * 60 * 60 * 1000L); // hard cap — never hold the CPU forever
            }
        } catch (Exception ignored) {
        }
    }

    private Notification buildNotification(String text, int received, int total) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("فریم")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true);
        if (total > 0) b.setProgress(total, received, false);
        else b.setProgress(0, 0, true);
        return b.build();
    }

    /** Live progress update from the plugin (throttled to ~2s, best-effort). */
    public static void update(Context ctx, String text, int received, int total) {
        long now = System.currentTimeMillis();
        if (now - lastNotifUpdate < 2000) return;
        lastNotifUpdate = now;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("فریم")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true);
            if (total > 0) b.setProgress(total, received, false);
            else b.setProgress(0, 0, true);
            nm.notify(NOTIF_ID, b.build());
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
