package com.orya.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class OriginPolicyTest {
    @Test public void acceptsOnlyExactHttpsOrigin() {
        assertTrue(OriginPolicy.sameOrigin(OriginPolicy.ORIGIN + "/mobile/driver"));
        assertTrue(OriginPolicy.sameOrigin(OriginPolicy.ORIGIN + ":443/mobile/operations"));
        for (String url : new String[]{"http://orya-parking-production.up.railway.app", OriginPolicy.ORIGIN + ".attacker.test", OriginPolicy.ORIGIN + ":444", "https://attacker@orya-parking-production.up.railway.app", "file:///etc/passwd", "javascript:alert(1)", "not a URL", "https://orya-parking-production.up.railway.app%2fattacker.test"}) {
            assertFalse(url, OriginPolicy.sameOrigin(url));
        }
    }
    @Test public void keepsRolesAndTicketPathsSeparate() {
        assertTrue(OriginPolicy.appPage(OriginPolicy.ORIGIN + "/mobile/driver?section=passes", "/mobile/driver"));
        assertFalse(OriginPolicy.appPage(OriginPolicy.ORIGIN + "/mobile/operations", "/mobile/driver"));
        String ticket = OriginPolicy.ORIGIN + "/api/ops/ticket/print?reference=SYN-TEST";
        assertTrue(OriginPolicy.ticket(ticket, true));
        assertFalse(OriginPolicy.ticket(ticket, false));
        assertFalse(OriginPolicy.ticket(OriginPolicy.ORIGIN + "/api/ops/ticket/print/../other", true));
        assertFalse(OriginPolicy.ticket(OriginPolicy.ORIGIN + "/api/ops/ticket/%70rint", true));
    }
    @Test public void externalLinksCannotOpenLocalOrPrivilegedSchemes() {
        assertTrue(OriginPolicy.externalHttps("https://www.openstreetmap.org/copyright"));
        for (String url : new String[]{"http://example.com", "intent://example", "file:///tmp/a", "javascript:alert(1)", "https://user:password@example.com", OriginPolicy.ORIGIN + "/api/manager/overview"}) {
            assertFalse(url, OriginPolicy.externalHttps(url));
        }
    }
}
