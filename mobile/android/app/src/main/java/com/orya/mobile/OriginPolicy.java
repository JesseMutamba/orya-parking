package com.orya.mobile;

import java.net.URI;

/** Exact HTTPS origin checks shared by navigation, popups and camera permission. */
final class OriginPolicy {
    static final String ORIGIN = "https://orya-parking-production.up.railway.app";
    private static final String HOST = URI.create(ORIGIN).getHost();
    static boolean sameOrigin(String value) {
        try {
            URI u = URI.create(value);
            return "https".equalsIgnoreCase(u.getScheme()) && HOST.equalsIgnoreCase(u.getHost())
                && u.getRawUserInfo() == null && (u.getPort() == -1 || u.getPort() == 443);
        } catch (RuntimeException e) { return false; }
    }
    static boolean appPage(String value, String appPath) {
        return sameOrigin(value) && appPath.equals(URI.create(value).getRawPath());
    }
    static boolean ticket(String value, boolean operations) {
        return operations && sameOrigin(value)
            && "/api/ops/ticket/print".equals(URI.create(value).getRawPath());
    }
    static boolean externalHttps(String value) {
        try {
            URI u = URI.create(value);
            return "https".equalsIgnoreCase(u.getScheme()) && u.getHost() != null
                && u.getRawUserInfo() == null && !sameOrigin(value);
        } catch (RuntimeException e) { return false; }
    }
}
