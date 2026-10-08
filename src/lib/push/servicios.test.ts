import { describe, expect, it } from "vitest";
import { esServicioPush, hostDeServicioPush } from "./servicios";

describe("esServicioPush", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://android.googleapis.com/gcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/QGuQ",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    "https://FCM.googleapis.com/fcm/send/abc",
  ])("acepta %s", (endpoint) => {
    expect(esServicioPush(endpoint)).toBe(true);
  });

  it.each([
    ["otro sitio", "https://example.com/push"],
    ["sin https", "http://fcm.googleapis.com/fcm/send/abc"],
    ["truco de la arroba", "https://fcm.googleapis.com@example.com/x"],
    ["usuario en la dirección", "https://u:p@fcm.googleapis.com/x"],
    ["otro puerto", "https://fcm.googleapis.com:8443/x"],
    ["subdominio que no es de Google", "https://fcm.googleapis.com.example.com/x"],
    ["parecido pero no termina igual", "https://evilpush.apple.com.example.com/x"],
    ["un subdominio de googleapis cualquiera", "https://storage.googleapis.com/x"],
    ["sin punto delante de la terminación", "https://notpush.apple.com/x"],
    ["red interna", "https://169.254.169.254/latest"],
    ["localhost", "https://localhost/x"],
    ["no es una dirección", "hola"],
  ])("rechaza: %s", (_, endpoint) => {
    expect(esServicioPush(endpoint)).toBe(false);
  });
});

describe("hostDeServicioPush", () => {
  it("devuelve el host en minúsculas, sin la ruta (que lleva el token)", () => {
    expect(hostDeServicioPush("https://Web.Push.Apple.com/QGuQ")).toBe("web.push.apple.com");
  });
});
