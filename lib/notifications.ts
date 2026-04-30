import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// Configure how notifications appear when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission denied");
    return null;
  }

  // Android channel setup
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Proxima",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7C3AED",
    });
  }

  // Get push token
  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export async function savePushToken(token: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("users").update({ push_token: token }).eq("id", user.id);
}

export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
) {
  const message = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data: { title, body },
  };

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
}

export async function createNotification(
  userId: string,
  title: string,
  body: string,
  type: string,
) {
  // Save to database
  await supabase.from("notifications").insert({
    user_id: userId,
    title,
    body,
    type,
  });

  // Get user's push token
  const { data: userData } = await supabase
    .from("users")
    .select("push_token")
    .eq("id", userId)
    .single();

  // Send push if token exists
  if (userData?.push_token) {
    await sendPushNotification(userData.push_token, title, body);
  }
}
