import { router } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";

const universities = [
  "TU Kenya",
  "University of Nairobi",
  "Kenyatta University",
  "Strathmore University",
  "JKUAT",
  "Moi University",
  "Other",
];

export default function SignupScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [university, setUniversity] = useState("");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("");
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = (email: string) => {
    return email.endsWith(".ac.ke") || email.endsWith(".edu");
  };

  const handleSignup = async () => {
    console.log("Create Account button pressed");
    if (
      !fullName ||
      !email ||
      !password ||
      !university ||
      !course ||
      !year ||
      !age
    ) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (!validateEmail(email)) {
      Alert.alert("Error", "Please use your university email (.ac.ke or .edu)");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          university,
          course,
          year_of_study: parseInt(year),
          age: parseInt(age),
        },
      },
    });

    setLoading(false);

    if (error) {
      Alert.alert("Signup Failed", error.message);
    } else {
      Alert.alert(
        "🚀 Welcome to Proxima!",
        "Your account has been created successfully!",
        [
          {
            text: "Go to Login",
            onPress: () => router.push("/login"),
          },
        ],
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.logo}>PROXIMA</Text>
      <Text style={styles.tagline}>Connect with peers around you</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your full name"
          placeholderTextColor="#666"
          value={fullName}
          onChangeText={setFullName}
        />

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
          placeholder="Minimum 6 characters"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.label}>University</Text>
        <View style={styles.optionsRow}>
          {universities.map((uni) => (
            <Pressable
              key={uni}
              style={[
                styles.optionButton,
                university === uni && styles.optionButtonActive,
              ]}
              onPress={() => setUniversity(uni)}
            >
              <Text
                style={[
                  styles.optionText,
                  university === uni && styles.optionTextActive,
                ]}
              >
                {uni}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Course / Programme</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Computer Science"
          placeholderTextColor="#666"
          value={course}
          onChangeText={setCourse}
        />

        <Text style={styles.label}>Year of Study</Text>
        <View style={styles.optionsRow}>
          {["1", "2", "3", "4"].map((y) => (
            <Pressable
              key={y}
              style={[
                styles.yearButton,
                year === y && styles.optionButtonActive,
              ]}
              onPress={() => setYear(y)}
            >
              <Text
                style={[
                  styles.optionText,
                  year === y && styles.optionTextActive,
                ]}
              >
                Year {y}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Age</Text>
        <TextInput
          style={styles.input}
          placeholder="Your age"
          placeholderTextColor="#666"
          value={age}
          onChangeText={setAge}
          keyboardType="numeric"
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </Pressable>

        <Text style={styles.loginText}>
          Already have an account?{" "}
          <Text style={styles.loginLink} onPress={() => router.push("/login")}>
            Log in
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    color: "#7C3AED",
    letterSpacing: 8,
    textAlign: "center",
  },
  tagline: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 40,
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
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  optionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    cursor: "pointer" as any,
  },
  yearButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    cursor: "pointer" as any,
  },
  optionButtonActive: {
    backgroundColor: "#7C3AED",
    borderColor: "#7C3AED",
  },
  optionText: {
    color: "#aaa",
    fontSize: 13,
  },
  optionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginTop: 32,
    cursor: "pointer" as any,
  },
  buttonPressed: {
    backgroundColor: "#6D28D9",
    opacity: 0.9,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  loginText: {
    color: "#666",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 40,
    fontSize: 14,
  },
  loginLink: {
    color: "#7C3AED",
    fontWeight: "600",
    cursor: "pointer" as any,
  },
});
