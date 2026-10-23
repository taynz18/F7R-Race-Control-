# Race Flags — setup walkthrough

Your project URL and publishable key are already filled in for `uyiafrzsyzrtnuxxjkye`. The public flag read and Realtime subscription have been checked successfully. You can skip copying keys in step 5. Admin sign-in and a flag change still need testing with your admin account; keep its password private.

Follow these steps in order. You do not need to install Python, run terminal commands, or send anyone your passwords to use the GitHub build route.

## 1. Create your Supabase project

1. Go to https://supabase.com/dashboard and sign in or create an account.
2. Choose **New project** and select your organisation.
3. Name it **Race Flags**. Set a database password and keep it private. Choose the region closest to your drivers.
4. Create the project and wait until it is ready.

The database password is for project administration. Your race-control sign-in will use a separate user account created in step 3 below.

## 2. Run the first SQL query

1. In your Supabase project, open **SQL Editor → New query**.
2. Open the supplied `supabase/01-setup.sql` file in Notepad or another text editor.
3. Copy the entire file, paste it into SQL Editor, and click **Run**.
4. Wait for success. This creates the flag state, admin list, history, access rules and live updates.

Run these queries as the default project database administrator in SQL Editor. If a query returns a red error, stop at that step and share the error text. Do not continue past an unsuccessful setup query.

## 3. Create your race-control admin account

1. Open **Authentication → Users** in Supabase.
2. Choose **Add user → Create new user** (the exact button label may vary).
3. Enter the email address and password you want to use for Race Control.
4. Enable **Auto Confirm User** if offered, then create the user. Otherwise complete the email confirmation before signing in.
5. In Authentication settings, disable **Allow new users to sign up**. Drivers do not need an account.

Next, approve this account to control flags:

6. Open `supabase/02-add-admin.sql` in your text editor and copy it into a **new SQL Editor query**.
7. In Supabase SQL Editor, replace `REPLACE-WITH-YOUR-ADMIN-EMAIL` in the `admin_email text := ...` line with the email you just used. Keep the single quotes.
8. Click **Run**. The supplied file can keep its placeholder when you upload it to GitHub.

Creating a user alone does not make them an admin. Query 02 grants that permission. You can run the same query for another admin by changing the email in its declaration.

## 4. Check the database access rules

Open `supabase/03-check-access.sql`, paste the entire file into a new SQL Editor query, and click **Run**.

It checks that drivers can read the signal and cannot change it, and that an unapproved signed-in account cannot send flags. Success means the checks completed without an error. This query rolls back its test transaction and does not leave a test flag active.

## 5. Fill in the connection file

1. Open your Supabase project's **Connect** dialog.
2. Copy the **Project URL** and **publishable key**. You can also find publishable keys in project **Settings → API Keys**.
3. Open the supplied `config.json` file in a text editor and replace its two placeholder values:

```json
{
  "supabase_url": "https://your-project-reference.supabase.co",
  "supabase_publishable_key": "sb_publishable_your_key_here"
}
```

Keep the property names, quotation marks and comma exactly as shown. Do not leave a trailing slash on the URL. Save the file as `config.json`, not `config.json.txt`.

The publishable key is designed to be included in the website and driver app. Database permissions protect flag changes. Never substitute the database password, a secret key starting with `sb_secret_`, a service-role key or your admin password.

## 6. Upload the files to GitHub

1. Sign in to https://github.com and create a repository named **race-flags**.
2. For the simplest GitHub Free Pages setup, choose **Public**. Private repository Pages availability depends on your plan.
3. Extract the supplied `race-flags-github.zip` on your computer.
4. In the repository, choose **Add file → Upload files** (or **uploading an existing file** on an empty repository).
5. Upload the extracted **contents**, including the `.github`, `supabase` and `tests` folders, plus the website, Python, configuration and guide files. Do not upload the ZIP itself or an extra outer folder.
6. Commit the files to the default branch, normally **main**.

At the top level of your repository you should see:

```text
.github/
  workflows/
    pages.yml
    release.yml
supabase/
  01-setup.sql
  02-add-admin.sql
  03-check-access.sql
tests/
  test_connection.py
  test_admin.cjs
.gitignore
index.html
admin.html
admin.css
admin.js
config.json
driver.py
connection.py
requirements.txt
README.md
START-HERE.md
```

Check that `config.json` contains your real project URL and publishable key before continuing. Check that `.github/workflows` is present. If an upload interface omits that folder, use GitHub's **Add file → Create new file** option to create `.github/workflows/pages.yml` and `.github/workflows/release.yml`, copying each supplied workflow's contents exactly.

## 7. Publish the admin portal

1. In your repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**. The workflow files are already supplied; you do not need to create a template workflow.
3. Open the repository's **Actions** tab. Enable workflows if GitHub asks.
4. Select **Publish admin portal → Run workflow**. Choose your default branch and run it.
5. Wait for a green success check. Open **Settings → Pages → Visit site**, or the deployment URL shown in the successful run.
6. Sign in with the race-control email and password you created in Supabase.

Your portal address will usually be `https://YOUR-GITHUB-USERNAME.github.io/race-flags/`. The opening page redirects to `admin.html`.

If sign-in is disabled, check `config.json` and republish. If sign-in succeeds but the account is not approved, rerun query 02 with that account's email. If you change any website/configuration files later, rerun **Publish admin portal**.

## 8. Generate the driver download

1. In GitHub, open **Actions → Windows driver release → Run workflow**.
2. Choose the default branch and enter a new version such as **v1.0.0**.
3. Click **Run workflow** and wait for success. The workflow installs dependencies, runs the source tests, builds the Windows app, checks the packaged overlay, and creates a release.
4. Open the repository's **Releases** section.
5. Open **v1.0.0** and download **RaceFlags-Windows.zip** under **Assets**. Choose this file rather than GitHub's automatically generated **Source code** ZIP.

For a later build, use a new version such as **v1.0.1**. Do not reuse a version that already has a release. If the workflow fails, open the failed step and share its error text. A failed build should be fixed before distributing the app.

The source bundle has no prebuilt executable. A successful GitHub build creates the driver download. The executable is unsigned, so Windows may show an app reputation notice.

## 9. Test it before sharing with drivers

1. Extract **RaceFlags-Windows.zip**. Open its **RaceFlags** folder and run **RaceFlags.exe**. Keep the `_internal` folder alongside it.
2. The app connects automatically using the configuration included in the build.
3. Keep the driver controls open or minimise them. Drag the centre of the overlay to move it, and drag any edge or corner to resize it. The **Size** slider is also available.
4. Enable **Transparent mode** to hide the overlay while no flag is active. Switch it off whenever you want to position a flag while the track is clear.
5. In the browser admin portal, select **Yellow**, **Safety Car**, **FCY**, **Red**, then **Green**. Verify each appears with its matching darker border.
6. Select **Clear flags**. The overlay should disappear while the settings window remains accessible.
7. Restart a driver while a flag is active and confirm it receives the saved flag. Briefly disconnect its internet and check that an OFFLINE panel appears, then reconnect and confirm recovery.
8. Repeat with a second computer before distributing the release link to the rest of your drivers.

Use windowed or borderless-windowed games. Exclusive fullscreen can cover desktop overlays. This version sends one shared flag to everyone; it does not target individual drivers or confirm delivery to each driver.

## Where each part lives

- **GitHub Pages:** the admin website.
- **Supabase:** admin sign-in, approved admin accounts, saved signal, signal history and live updates.
- **GitHub Releases:** the Windows driver download.
- **Driver computers:** the movable, resizable overlay and its saved preferences.

Local source tests have passed. Live database permissions/sign-in and the packaged Windows release still need checking with your project and GitHub build.

Official references: [Supabase project setup](https://supabase.com/docs/guides/getting-started/tutorials/with-react), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
