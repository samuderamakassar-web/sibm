// Taruh file ini persis di public/firebase-messaging-sw.js (root public, bukan di dalam folder)
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCgSsts6ln11Nk1UklAyZt2YrYXu1xrMLo",
  authDomain: "sibm-app.firebaseapp.com",
  projectId: "sibm-app",
  storageBucket: "sibm-app.firebasestorage.app",
  messagingSenderId: "98949286064",
  appId: "1:98949286064:web:bf627ae1653f2d4d67d375",
});

const messaging = firebase.messaging();

// Tampilkan notifikasi saat app tertutup/background
messaging.onBackgroundMessage((payload) => {
  const judul = payload.notification?.title || "Pengingat Checklist Kebersihan";
  const opsi = {
    body: payload.notification?.body || "Waktunya isi checklist kebersihan.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // §65: halaman tujuan saat notifikasi diketuk (dikirim cron lewat data.link, mis.
    // "/dashboard/security/validasi"). Tanpa link -> buka beranda.
    data: { link: payload.data?.link || payload.fcmOptions?.link || "/" },
    // catatan: browser modern tidak lagi support file suara custom di sini,
    // yang bunyi adalah suara notifikasi default OS/browser
  };
  self.registration.showNotification(judul, opsi);
});

// §65: dulu TIDAK ada penanganan klik -> notifikasi yang diketuk tidak membuka halaman apa pun.
// Notifikasi yang ditampilkan otomatis oleh SDK (punya data.FCM_MSG) sudah diurus SDK sendiri.
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  if (data.FCM_MSG) return;
  event.notification.close();
  const tujuan = new URL(data.link || "/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((daftar) => {
      for (const c of daftar) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(tujuan);
          return c.focus();
        }
      }
      return clients.openWindow(tujuan);
    })
  );
});
