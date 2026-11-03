import SwiftUI
import WebKit
import SafariServices
import UIKit

enum AppLanguage {
    static var current: String { UserDefaults.standard.string(forKey: "orya.language") == "fr" ? "fr" : "en" }
    static let french: [String: String] = [
        "Orya Operations": "Orya Opérations",
        "Orya Parking": "Orya Stationnement",
        "TEST BUILD": "VERSION D’ESSAI",
        "Reload app": "Actualiser l’application",
        "Test server settings": "Paramètres du serveur d’essai",
        "Connect this test build to your Orya server.": "Connectez cette version d’essai à votre serveur Orya.",
        "Set test server": "Configurer le serveur d’essai",
        "Orya test server": "Serveur d’essai Orya",
        "https://your-test-server": "https://votre-serveur-essai",
        "In the Simulator, use http://127.0.0.1:3040. On an iPhone, use the Mac’s private Wi-Fi address after enabling the LAN preview, or an HTTPS test server. The Mac must stay running.": "Dans le simulateur, utilisez http://127.0.0.1:3040. Sur un iPhone, utilisez l’adresse Wi-Fi privée du Mac après avoir activé l’aperçu sur le réseau local, ou un serveur d’essai HTTPS. Le Mac doit rester allumé.",
        "This build requires an HTTPS server address. TestFlight distribution does not host the parking server.": "Cette version nécessite une adresse de serveur HTTPS. La distribution par TestFlight n’héberge pas le serveur de stationnement.",
        "Use synthetic accounts and demo payments during testing. Both Orya apps must use the same server to share parking records.": "Utilisez des comptes fictifs et des paiements de démonstration pendant les essais. Les deux applications Orya doivent utiliser le même serveur pour partager les données de stationnement.",
        "Test connection": "Connexion d’essai",
        "Cancel": "Annuler",
        "Connect": "Connecter",
        "Cannot reach the Orya server.\nCheck your internet connection and try again. Parking and payment status are unknown until reconnected.": "Impossible de joindre le serveur Orya.\nVérifiez votre connexion Internet et réessayez. L’état du stationnement et du paiement reste inconnu jusqu’au rétablissement de la connexion.",
        "Try again": "Réessayer",
        "Confirm": "Confirmer",
        "Ticket preview": "Aperçu du ticket",
        "Print": "Imprimer",
        "Ticket unavailable": "Ticket indisponible",
        "Orya parking ticket": "Ticket de stationnement Orya",
        "Done": "Terminé"
    ]
    static func text(_ source: String) -> String { current == "fr" ? (french[source] ?? source) : source }
}

enum Product {
    static var operations: Bool { Bundle.main.object(forInfoDictionaryKey: "OryaRole") as? String == "operations" }
    static var name: String { operations ? AppLanguage.text("Orya Operations") : AppLanguage.text("Orya Parking") }
    static var path: String { operations ? "/mobile/operations" : "/mobile/driver" }
    static var defaultOrigin: String {
        #if DEBUG
        return "http://127.0.0.1:3040"
        #else
        return Bundle.main.object(forInfoDictionaryKey: "OryaBackendOrigin") as? String ?? ""
        #endif
    }
}


@main struct OryaApp: App {
    var body: some Scene { WindowGroup { OryaRoot() } }
}

struct OryaRoot: View {
    @AppStorage("orya.language") private var language = "en"
    #if DEBUG
    @AppStorage("oryaBackendOrigin") private var origin = Product.defaultOrigin
    #else
    private let origin = Product.defaultOrigin
    #endif
    @State private var settings = false
    @State private var refresh = UUID()
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(AppLanguage.text("TEST BUILD")).font(.system(size: 10, weight: .semibold)).tracking(1)
                Spacer()
                Button { language = language == "fr" ? "en" : "fr" } label: { Text(language == "fr" ? "FR / EN" : "EN / FR") }.accessibilityLabel("English / Français")
                Button { refresh = UUID() } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel(AppLanguage.text("Reload app"))
                #if DEBUG
                Button { settings = true } label: { Image(systemName: "network") }.accessibilityLabel(AppLanguage.text("Test server settings")).padding(.leading, 18)
                #endif
            }.padding(.horizontal, 22).padding(.vertical, 10).foregroundColor(Color(red: 0.09, green: 0.25, blue: 0.21))
            if let base = BackendAddress.validated(origin) {
                ParkingWebView(base: base, language: language).id(origin + refresh.uuidString)
            } else {
                Spacer()
                Image(systemName: "parkingsign.circle.fill").font(.system(size: 70)).foregroundColor(.green)
                Text(Product.name).font(.title2).padding(.top)
                Text(AppLanguage.text("Connect this test build to your Orya server.")).multilineTextAlignment(.center).padding()
                Button(AppLanguage.text("Set test server")) { settings = true }.buttonStyle(.borderedProminent)
                Spacer()
            }
        }
        .background(Color(red: 0.965, green: 0.97, blue: 0.95))
        #if DEBUG
        .sheet(isPresented: $settings) { ServerSettings(origin: $origin) }
        #endif
    }
}

struct ServerSettings: View {
    @AppStorage("orya.language") private var language = "en"
    @Binding var origin: String
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text(AppLanguage.text("Orya test server"))) {
                    TextField(AppLanguage.text("https://your-test-server"), text: $draft).keyboardType(.URL).textInputAutocapitalization(.never).disableAutocorrection(true)
                    #if DEBUG
                    Text(AppLanguage.text("In the Simulator, use http://127.0.0.1:3040. On an iPhone, use the Mac’s private Wi-Fi address after enabling the LAN preview, or an HTTPS test server. The Mac must stay running.")).font(.footnote)
                    #else
                    Text(AppLanguage.text("This build requires an HTTPS server address. TestFlight distribution does not host the parking server.")).font(.footnote)
                    #endif
                }
                Section { Text(AppLanguage.text("Use synthetic accounts and demo payments during testing. Both Orya apps must use the same server to share parking records.")).font(.footnote) }
            }.navigationTitle(AppLanguage.text("Test connection"))
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(AppLanguage.text("Cancel")) { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button(AppLanguage.text("Connect")) { origin = draft.trimmingCharacters(in: .whitespacesAndNewlines); dismiss() }.disabled(BackendAddress.validated(draft) == nil) }
                }
        }.onAppear { draft = origin }
    }
}

struct ParkingWebView: UIViewControllerRepresentable {
    let base: URL
    let language: String
    func makeUIViewController(context: Context) -> ParkingController { ParkingController(base: base) }
    func updateUIViewController(_ controller: ParkingController, context: Context) { controller.setLanguage(language) }
}

// One WKWebView origin preserves the backend's HttpOnly sessions and same-origin
// checks. Each app's bundle has its own cookie store. There is no native payment
// override, background tracking, offline mutation queue or JavaScript credential store.
final class ParkingController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    let base: URL
    private var web: WKWebView!
    private let errorPanel = UIStackView()
    private let spinner = UIActivityIndicatorView(style: .medium)
    init(base: URL) { self.base = base; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.add(WeakMessageHandler(self), name: "oryaLanguage")
        config.userContentController.addUserScript(WKUserScript(source: "try{localStorage.setItem('orya.language','\(AppLanguage.current)')}catch{}", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if Product.operations { config.userContentController.add(WeakMessageHandler(self), name: "oryaPrint") }
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.isOpaque = false; web.backgroundColor = UIColor(red: 0.965, green: 0.97, blue: 0.95, alpha: 1)
        web.allowsBackForwardNavigationGestures = true
        view.addSubview(web); web.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: view.topAnchor),web.bottomAnchor.constraint(equalTo: view.bottomAnchor),web.leadingAnchor.constraint(equalTo: view.leadingAnchor),web.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        spinner.hidesWhenStopped = true; spinner.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(spinner)
        NSLayoutConstraint.activate([spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        errorPanel.axis = .vertical; errorPanel.alignment = .center; errorPanel.spacing = 16
        errorPanel.backgroundColor = .systemBackground; errorPanel.isLayoutMarginsRelativeArrangement = true; errorPanel.layoutMargins = UIEdgeInsets(top: 28, left: 24, bottom: 28, right: 24)
        let label = UILabel(); label.numberOfLines = 0; label.textAlignment = .center
        label.text = AppLanguage.text("Cannot reach the Orya server.\nCheck your internet connection and try again. Parking and payment status are unknown until reconnected.")
        let retry = UIButton(type: .system); retry.setTitle(AppLanguage.text("Try again"), for: .normal); retry.addTarget(self, action: #selector(loadHome), for: .touchUpInside)
        errorPanel.addArrangedSubview(label); errorPanel.addArrangedSubview(retry); errorPanel.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(errorPanel)
        NSLayoutConstraint.activate([errorPanel.centerYAnchor.constraint(equalTo: view.centerYAnchor),errorPanel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),errorPanel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20)])
        loadHome()
    }
    func setLanguage(_ language: String) {
        let value = language == "fr" ? "fr" : "en"
        guard web != nil else { return }
        web.evaluateJavaScript("window.i18n?.setLanguage('\(value)')", completionHandler: nil)
        (errorPanel.arrangedSubviews.first as? UILabel)?.text = AppLanguage.text("Cannot reach the Orya server.\nCheck your internet connection and try again. Parking and payment status are unknown until reconnected.")
        (errorPanel.arrangedSubviews.last as? UIButton)?.setTitle(AppLanguage.text("Try again"), for: .normal)
    }
    @objc private func loadHome() {
        errorPanel.isHidden = true; spinner.startAnimating()
        web.load(URLRequest(url: base.appendingPathComponent(Product.path), cachePolicy: .reloadIgnoringLocalCacheData))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { spinner.stopAnimating(); errorPanel.isHidden = true }
    private func failed(_ error: Error) { if (error as NSError).code != NSURLErrorCancelled { spinner.stopAnimating(); errorPanel.isHidden = false } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { errorPanel.isHidden = false }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if BackendAddress.sameOrigin(url,base), url.path == Product.path { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        if Product.operations, BackendAddress.sameOrigin(url,base), url.path == "/api/ops/ticket/print" { showTicket(url); return }
        if action.navigationType == .linkActivated, ["https","http"].contains(url.scheme ?? "") { present(SFSafariViewController(url: url), animated: true) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if Product.operations, BackendAddress.sameOrigin(url,base),url.path == "/api/ops/ticket/print" { showTicket(url) }
        else if ["https","http"].contains(url.scheme ?? "") { present(SFSafariViewController(url: url), animated: true) }
        return nil
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "oryaLanguage" {
            guard message.frameInfo.isMainFrame, let frameURL = message.frameInfo.request.url, BackendAddress.sameOrigin(frameURL,base), let value = message.body as? String, ["en","fr"].contains(value) else { return }
            if AppLanguage.current != value { UserDefaults.standard.set(value, forKey: "orya.language") }
            return
        }
        guard message.name == "oryaPrint", Product.operations, message.frameInfo.isMainFrame, let frameURL = message.frameInfo.request.url, BackendAddress.sameOrigin(frameURL,base), let value = message.body as? String, let url = URL(string: value), BackendAddress.sameOrigin(url,base),url.path == "/api/ops/ticket/print" else { return }
        showTicket(url)
    }
    private func showTicket(_ url: URL) {
        guard presentedViewController == nil else { return }
        present(UINavigationController(rootViewController: TicketController(url: url)), animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: Product.name, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: AppLanguage.text("Cancel"), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: AppLanguage.text("Confirm"), style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}

// Avoid a WKUserContentController -> view controller retain cycle.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) { target?.userContentController(controller, didReceive: message) }
}

final class TicketController: UIViewController, WKNavigationDelegate {
    private let url: URL
    private var web: WKWebView!
    init(url: URL) { self.url = url; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func viewDidLoad() {
        super.viewDidLoad(); title = AppLanguage.text("Ticket preview")
        let config = WKWebViewConfiguration(); config.websiteDataStore = .default()
        web = WKWebView(frame: view.bounds, configuration: config); web.autoresizingMask = [.flexibleWidth,.flexibleHeight];web.navigationDelegate = self;view.addSubview(web)
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: AppLanguage.text("Done"), style: .done, target: self, action: #selector(done))
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: AppLanguage.text("Print"), style: .plain, target: self, action: #selector(printTicket));navigationItem.rightBarButtonItem?.isEnabled = false
        var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        parts.queryItems = parts.queryItems?.filter { $0.name != "autoprint" }
        web.load(URLRequest(url: parts.url!, cachePolicy: .reloadIgnoringLocalCacheData))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { navigationItem.rightBarButtonItem?.isEnabled = true }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = response.response as? HTTPURLResponse, http.statusCode != 200 { title = AppLanguage.text("Ticket unavailable");decisionHandler(.cancel);return };decisionHandler(.allow)
    }
    @objc private func done() { dismiss(animated: true) }
    @objc private func printTicket() {
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil);info.jobName = AppLanguage.text("Orya parking ticket");info.outputType = .general
        controller.printInfo = info;controller.printFormatter = web.viewPrintFormatter()
        controller.present(from: navigationItem.rightBarButtonItem!, animated: true, completionHandler: nil)
    }
}
