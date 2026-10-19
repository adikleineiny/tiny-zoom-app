# Tiny Zoom – iOS setup guide (no Mac needed)

This folder is a ready-made iOS app project for the Tiny Zoom game.
The game itself is the web game in `www/`. Capacitor wraps it in a real iOS app.
A cloud Mac (GitHub Actions, or Codemagic) builds the app and sends it to TestFlight.
You only need a web browser and your iPhone.

What is already done:

* iOS Xcode project in `ios/App` (Capacitor 8, Swift Package Manager, so no CocoaPods).
* App ID `com.adikleineiny.tinyzoom`, name **Tiny Zoom**.
* Landscape only, full screen, status bar hidden. Works on iPhone and iPad.
* App icon (1024×1024) and a launch screen.
* `ITSAppUsesNonExemptEncryption = NO` is set, so TestFlight will not ask the encryption question.
* Cloud build files: `.github/workflows/ios-testflight.yml` (GitHub) and `codemagic.yaml` (Codemagic).

---

## Step 0 – Put this project on GitHub (you can do this today)

1. Create a free account at <https://github.com> if you don't have one.
2. Create a **new repository**, for example `tiny-zoom-app`.
   * **Public** repos get free macOS build minutes with no limit.
   * **Private** repos also work, but macOS minutes count 10× against your free monthly minutes.
     One build takes about 10–15 minutes.
3. Upload all the files from this folder, **including the hidden `.github` folder**.
   Use `git push` from a computer. You can also use GitHub's web page: *Add file → Upload files* and drag the whole folder in.
   Do **not** upload `node_modules`. The zip doesn't contain it.

---

## Step 1 – After Apple approves your enrollment: find your Team ID

1. Go to <https://developer.apple.com/account> and sign in.
2. Scroll to **Membership details**.
3. Copy the **Team ID**. It is 10 letters and numbers, for example `A1B2C3D4E5`.
4. If the page shows a new agreement, accept it. Builds fail until you do.

## Step 2 – Register the App ID (bundle ID)

1. Go to <https://developer.apple.com/account/resources/identifiers/list>.
2. Click the blue **+** button, choose **App IDs**, then **Continue**. Choose **App**, then **Continue**.
3. Fill in:
   * Description: `Tiny Zoom`
   * Bundle ID: **Explicit**, `com.adikleineiny.tinyzoom`. It must match exactly.
   * Capabilities: leave everything off.
4. Click **Continue**, then **Register**.

## Step 3 – Create the app in App Store Connect

1. Go to <https://appstoreconnect.apple.com>, then **Apps**.
2. Click the **+** button, then **New App**.
3. Fill in:
   * Platforms: **iOS**
   * Name: `Tiny Zoom`. This is the name on the App Store and it must be unique.
     If the name is taken, try `Tiny Zoom: RC Racing` or similar.
     The name under the icon on the home screen stays "Tiny Zoom" either way.
   * Primary language: English
   * Bundle ID: pick `com.adikleineiny.tinyzoom` from the list
   * SKU: anything, for example `tinyzoom001`
   * User Access: Full Access
4. Click **Create**.

## Step 4 – Create an App Store Connect API key (lets the cloud Mac sign and upload)

1. In App Store Connect, go to **Users and Access**, then the **Integrations** tab, then **App Store Connect API**.
   * The first time, you may need to click **Request Access** and accept. This is instant for the Account Holder.
2. Under **Team Keys**, click **+** (Generate API Key).
   * Name: `GitHub CI`
   * Access: **Admin**. This is needed so Xcode can create the signing certificate in the cloud.
3. Click **Generate**.
4. Write down two values:
   * **Issuer ID**: shown above the table. It looks like `57246542-96fe-1a63-e053-0824d011072a`.
   * **Key ID**: in the row of your new key. It looks like `2X9R4HXF34`.
5. Click **Download** to get the file `AuthKey_<KeyID>.p8`.
   **You can download it only once.** Keep it somewhere safe and never post it publicly.

## Step 5 – Add the secrets to GitHub

In your GitHub repo, go to **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**.
Add these four secrets:

| Secret name | What to paste |
|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | the Key ID (step 4) |
| `APP_STORE_CONNECT_ISSUER_ID` | the Issuer ID (step 4) |
| `APP_STORE_CONNECT_API_KEY_P8` | the **whole text** of the `.p8` file. Open it in a text editor and copy everything, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` |
| `APPLE_TEAM_ID` | your Team ID (step 1) |

## Step 6 – Build in the cloud and upload to TestFlight

1. In your GitHub repo, open the **Actions** tab. If asked, click "I understand… enable workflows".
2. Click **iOS - TestFlight** on the left, then **Run workflow**, then **Run workflow**.
3. Wait about 10–15 minutes. A green check means the build was uploaded.
4. In App Store Connect, open **Apps → Tiny Zoom → TestFlight**. The build shows "Processing" for 5–30 minutes, then "Ready to Submit" or "Testing".
   * If it shows **Missing Compliance**, click it and answer "None of the algorithms mentioned above". This normally won't happen, because the project already declares no special encryption.

You can also build automatically. Push a git tag that starts with `ios-v`, for example `ios-v1.0.1`.

## Step 7 – Install on your iPhone with TestFlight

1. On your iPhone, install **TestFlight** from the App Store. It's a free Apple app.
2. In App Store Connect, go to **Tiny Zoom → TestFlight → Internal Testing** and click **+**.
   Create a group (for example "Me") and add yourself as a tester.
   You are already a user of your own team, so you'll be in the list.
3. You get an email invitation. Open it on the iPhone and tap **View in TestFlight**.
   You can also open TestFlight directly. Tiny Zoom appears there.
4. Tap **Install**. Done! New builds show up in TestFlight automatically after each workflow run.

Internal testers (up to 100 people on your team) don't need Apple review.
To invite friends by email or a public link, use **External Testing**.
That needs a short beta review and some "Test Information" in App Store Connect.

---

## Step 8 – Publishing on the App Store (when you're ready)

In App Store Connect, go to **Tiny Zoom → App Store tab → iOS App 1.0**, then:

1. **Screenshots**. They are required.
   * iPhone 6.9": 1320×2868 portrait or **2868×1320 landscape**.
   * The app also supports iPad, so iPad 13" screenshots are required too: 2064×2752 or **2752×2064 landscape**.
   * Take them in TestFlight on your iPhone (press side button + volume up), or make them from the web version.
   * Don't want to deal with iPad screenshots? Make the app iPhone-only. In `ios/App/App.xcodeproj/project.pbxproj`, change both lines `TARGETED_DEVICE_FAMILY = "1,2";` to `TARGETED_DEVICE_FAMILY = 1;`, then build again.
2. Description, keywords, support URL, and a **privacy policy URL**. A simple page saying "Tiny Zoom collects no data" is enough. It can be hosted on GitHub Pages.
3. **App Privacy** questions: choose "No, we do not collect data".
4. **Age rating** questionnaire. Category: Games → Racing.
5. Price: Free (no paid agreement needed). Choose the countries.
6. Under **Build**, pick the TestFlight build. Then click **Add for Review** and **Submit**. Review usually takes 1–2 days.

Apple sometimes rejects apps that are "just a website". Tiny Zoom runs fully offline from files inside the app and is a real game, so it should be fine.

---

## Updating the game later

1. Replace the files in `www/` with the new game files.
   If you have the original folder next to this one, run `npm run sync:web`.
2. Commit and push, then run the workflow again (Step 6). The build number goes up automatically.
3. For a new **version number** (for example 1.1 instead of 1.0), change both `MARKETING_VERSION = 1.0;` lines in `ios/App/App.xcodeproj/project.pbxproj`.

## Option B – Codemagic instead of GitHub Actions

`codemagic.yaml` does the same job on <https://codemagic.io>, which has free macOS minutes every month.

1. Sign up with your GitHub account and add the repository.
2. **Team settings → Team integrations → Developer Portal → Manage keys → Add key**. Name it `TinyZoomASC`, then enter the Issuer ID, Key ID and the `.p8` file.
3. **Team settings → codemagic.yaml settings → Code signing identities**:
   * *iOS certificates → Generate certificate*, type **Apple Distribution**. Download it, write down the password, and upload it on the same tab.
   * *iOS provisioning profiles → Fetch profiles*, then pick the App Store profile for `com.adikleineiny.tinyzoom`.
     If there is none, create one first at developer.apple.com → Profiles → **+** → *App Store Connect*. Choose the App ID and the distribution certificate.
4. Start the **ios-testflight** workflow. The build lands in TestFlight the same way.

## Troubleshooting (GitHub workflow)

| Error message contains | Fix |
|---|---|
| `No Account for Team` / `No profiles for 'com.adikleineiny.tinyzoom'` | Check `APPLE_TEAM_ID`. Check that the App ID from Step 2 exists. Check that the API key has the **Admin** role. |
| `Cloud signing permission error` / `not allowed to perform this operation` | The API key must be **Admin**. Make a new key and update the secrets. |
| `maximum number of certificates` | Go to developer.apple.com → Certificates. Revoke old "Apple Development" certificates created by the CI, then run again. |
| `bundle version must be higher` | Just run again. The build number is the run number. If you uploaded from somewhere else, raise the number in the workflow (`BUILD_NUMBER`). |
| `Invalid API key` / `401` | The `.p8` text was pasted incompletely. Paste the whole file again, including the BEGIN/END lines. |
| `agreement` / `PLA` | Accept the latest agreement at developer.apple.com/account and in App Store Connect → Business. |

Download the `xcode-logs` artifact from the failed run to see the full log.

---

## What's in this folder

```
capacitor.config.json        Capacitor settings (app ID, name, web folder)
package.json                 npm packages (Capacitor 8) and helper scripts
www/                         the game (index.html, ES module JS, three.module.min.js)
ios/App/App.xcodeproj        Xcode project (shared scheme "App")
ios/App/App/Info.plist       landscape-only, full screen, hidden status bar, display name
ios/App/App/Assets.xcassets  AppIcon (1024×1024) and Splash images
ios/App/CapApp-SPM/          Swift Package that pulls in Capacitor (no CocoaPods)
resources/make_icons.py      regenerates icon and splash (python3 + Pillow)
tools/smoke_test.py          headless browser test of www/ (python3 + playwright)
.github/workflows/ios-testflight.yml   GitHub Actions cloud build → TestFlight
codemagic.yaml               Codemagic cloud build → TestFlight (alternative)
```

The folder `ios/App/App/public` (the copy of `www/` inside the iOS app) is created by `npx cap sync ios`.
The cloud build runs that command for you.
To run it on your own computer, you need Node.js 22 or newer.
