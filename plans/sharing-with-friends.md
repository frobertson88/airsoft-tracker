# Sharing the app with friends' phones

The app's data already lives online in Supabase. To let phones off your network run the app, you publish the app's code to Expo's servers with **EAS Update** (free up to 1,000 users a month). Friends then open it in Expo Go, and your PC doesn't need to be on.

**One catch (Expo's rule since May 2026):** Expo Go only opens a published app for people who own it or belong to the Expo organization that owns it. So you make a free organization and add your friends to it as **Viewers**, which only lets them open the app in Expo Go. Organization members are free and unlimited.

## Once, on your PC

Run these in Command Prompt.

1. **Install the Expo tools:** `npm install -g eas-cli`
2. **Create a free account** at https://expo.dev/signup, then log in: `eas login`
3. **Make an organization:** on expo.dev, open the account menu at the top left and create one, for example `fraser-airsoft`.
4. **Link the app to it:** in the `mobile` folder run `eas init`. When it asks which account should own the project, pick the organization. This adds `owner` and a project id to app.json.
5. **Publish:** `eas update --branch main --message "First share"`

## Adding a friend

1. They make a free Expo account at https://expo.dev/signup.
2. On expo.dev, go to your organization's settings, open **Members**, and invite their email or username as **Viewer**.
3. They install **Expo Go** from the App Store or Play Store and sign in with their Expo account.
4. The app shows in Expo Go under your organization's projects. Tap it to open.

## After you change something

Run step 5 again with a new message. Friends get the new version the next time they fully close and reopen it.

## Notes

- Publishing bundles your `.env` values into the app. That's fine here, because the Supabase key in it is the public key that every copy of the app already carries.
- Camera, maps and location all work in Expo Go, so nothing else is needed.
- For later, without Expo Go: Android friends could install an app file from EAS Build (`eas build -p android --profile preview`, 15 free builds a month). iPhones need a paid Apple developer account for that route.
