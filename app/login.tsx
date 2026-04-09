import { router } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert("Login Failed", error.message);
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>PROXIMA</Text>
      <Text style={styles.tagline}>Your campus. Your people.</Text>

      <View style={styles.form}>
        <Text style={styles.label}>University Email</Text>
        <TextInput
          style={styles.input}
          placeholder="yourname@university.ac.ke"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </Pressable>

        <Text style={styles.signupText}>
          New to Proxima?{" "}
          <Text
            style={styles.signupLink}
            onPress={() => router.push("/signup")}
          >
            Create account
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    padding: 24,
    justifyContent: "center",
  },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    color: "#7C3AED",
    letterSpacing: 8,
    textAlign: "center",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 60,
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: "#aaa",
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    color: "#fff",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  signupText: {
    color: "#666",
    textAlign: "center",
    marginTop: 20,
    fontSize: 14,
  },
  signupLink: {
    color: "#7C3AED",
    fontWeight: "600",
    cursor: "pointer" as any,
  },
  button: {
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    padding: 18,
    marginTop: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
