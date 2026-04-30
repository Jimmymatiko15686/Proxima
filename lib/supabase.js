import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const storage =
  Platform.OS === "web"
    ? {
        getItem: (key) => {
          try {
            return Promise.resolve(localStorage.getItem(key));
          } catch {
            return Promise.resolve(null);
          }
        },
        setItem: (key, value) => {
          try {
            localStorage.setItem(key, value);
            return Promise.resolve();
          } catch {
            return Promise.resolve();
          }
        },
        removeItem: (key) => {
          try {
            localStorage.removeItem(key);
            return Promise.resolve();
          } catch {
            return Promise.resolve();
          }
        },
      }
    : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
