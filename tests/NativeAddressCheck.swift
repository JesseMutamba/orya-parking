import Foundation
@main struct NativeAddressCheck {
    static func main() {
        let secure = BackendAddress.validated("https://parking.example.test")!
        precondition(secure.appendingPathComponent("/mobile/driver").path == "/mobile/driver")
        for bad in ["ftp://parking.example.test","https://user:password@parking.example.test","https://parking.example.test/path","https://parking.example.test?token=secret","https://parking.example.test#secret","http://public.example.test","http://192.168.1.1.attacker.test","http://999.0.0.1"] {
            precondition(BackendAddress.validated(bad) == nil, bad)
        }
        for local in ["http://127.0.0.1:3040","http://192.168.1.25:3041","http://10.0.0.1","http://172.16.0.1"] {
            #if DEBUG
            precondition(BackendAddress.validated(local) != nil, local)
            #else
            precondition(BackendAddress.validated(local) == nil, local)
            #endif
        }
        precondition(BackendAddress.sameOrigin(secure,URL(string:"https://parking.example.test:443/mobile/driver")!))
        precondition(!BackendAddress.sameOrigin(secure,URL(string:"https://parking.example.test:444/mobile/driver")!))
        precondition(!BackendAddress.sameOrigin(secure,URL(string:"http://parking.example.test/mobile/driver")!))
        print("Native backend address checks passed.")
    }
}
