# Orya mobile beta

Two apps, sharing the existing hosted backend:

| Role | iOS scheme | Beta bundle / Android application ID |
| --- | --- | --- |
| Driver | OryaParking | com.orya.parking.beta |
| Staff / management | OryaOperations | com.orya.operations.beta |

Release builds open `https://orya-parking-production.up.railway.app` directly. These are native WebView containers for the existing mobile interfaces, not offline applications. The service remains a synthetic-data demo with simulated payments. Server-side authentication and authorization are unchanged. Each installed app has its own cookie store.

## Android APKs

Android 8.0/API 26 or later, with an updated Android System WebView or Chrome.

The GitHub `Mobile beta builds` workflow builds both release APKs, runs the URL-policy tests and Android lint, and checks ZIP alignment. Its APK artifact is **unsigned** and is not an installer to share. Sign each APK locally with the retained beta signing key, then verify its certificate and APK signature before distribution. No signing key or password belongs in Git or a workflow artifact.

For local builds install Android Studio/SDK 36 and build-tools 36.0.0, JDK 17+, and Gradle 9.2.1. Accept SDK agreements yourself. Run `gradle -p mobile/android test lint assembleRelease`. Release builds are not debuggable, block cleartext and mixed content, and do not back up browser/session data to Android backups. Only Operations declares optional camera access; the OS permission is requested when scanning is used. No microphone or location permission is requested.

Ticket popups stay on the authenticated Orya HTTPS origin. Staff can open the system print sheet from the native Print ticket button. A printer or PDF provider and real camera scanning still require device testing. CSV exports currently display guidance to use the desktop web app. Native controls follow the phone's English/French system language; the web interface retains its own EN/FR switch. No native JavaScript credential/file bridge is exposed.

Install the signed Driver or Operations APK on a test phone; Android may ask you to permit installation from that download source. Use synthetic accounts. Confirm cold launch, sign-in after reopening, the edited-pass plate/duration, map navigation, staff alert ordering, keyboard layout, offline/retry, camera permissions and ticket preview/printing. A successful build does not establish device acceptance.

## iPhone / TestFlight

Requires iOS 16+. `mobile/ios/OryaMobile.xcodeproj` has Driver and Operations schemes. The CI job compiles unsigned iPhone and Simulator Release builds. Those artifacts cannot be installed on an ordinary iPhone or uploaded as signed TestFlight builds.

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/). The owner completes Apple's identity, agreement and payment steps.
2. Install full Xcode with a supported iOS SDK. Open the project, add the Apple developer account, and choose its team for both targets. Register the beta bundle IDs, or update them if they are unavailable.
3. Test both apps on an iPhone. Create separate App Store Connect records, supply app/beta metadata and a feedback contact, review privacy/export-compliance answers, and provide a suitable synthetic review account for Operations.
4. Archive each scheme in Release, validate, and upload from Xcode Organizer. After processing, add the builds to TestFlight groups. External testers require Apple's TestFlight review for the first build.

The native privacy manifest declares app-only UserDefaults access. It does not replace the developer's review of hosted account/vehicle-data collection in App Store Connect. No Apple membership, signing identity, provisioning profile, app record, reviewer credentials or tester invitation is created by this source change.

Project regeneration replaces generated Xcode build settings. Supply signing on the archive command or configure it after regeneration. Release uses the bundled HTTPS origin; editable server settings remain Debug-only.

References: [Apple TestFlight](https://developer.apple.com/testflight/), [Android release preparation](https://developer.android.com/studio/publish/preparing).
