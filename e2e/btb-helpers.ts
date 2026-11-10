import type { APIRequestContext } from "@playwright/test";
import { expect, password, workspacePassword } from "./fixtures";
import type { BtbEmployee } from "../src/lib/btb-team";
import type { BtbTrainingTopic } from "../src/lib/btb-training";
import type { TrainingSection } from "../src/lib/training";

export const appOrigin = "http://127.0.0.1:5101";
export const restaurant = "Between the Buns";

export async function apiSignIn(request: APIRequestContext, email = "manager@btb.demo", credential = email.endsWith("@btb.demo") ? workspacePassword : password) {
  const response = await request.post("/api/btb/login", { headers: { Origin: appOrigin }, data: { email, password: credential } });
  await expect(response).toBeOK();
}

export async function createEmployee(request: APIRequestContext, overrides: Partial<BtbEmployee> = {}): Promise<BtbEmployee> {
  const response = await request.post("/api/btb/employees", { data: {
    id: null, version: 0, name: "Alexandra Employee", email: "alexandra@team.test", phone: "306-555-0123", position: "Front counter", role: "staff", active: true, password, ...overrides,
  } });
  await expect(response).toBeOK();
  return (await response.json()).employee;
}

export async function createTrainingModule(request: APIRequestContext): Promise<{ topic: BtbTrainingTopic; sections: TrainingSection[] }> {
  const response = await request.post("/api/btb/training/topics", { data: {
    id: null, revision: 0, title: "A safe opening", category: "food_safety", est_minutes: 8, video_url: "", published: true,
    sections: [{ heading: "Wash hands", body: "Wash with soap before preparing food." }, { heading: "Prepare the station", body: "Check the sanitizer.\n- Set out clean utensils.\n- Confirm fridge temperatures." }],
  } });
  await expect(response).toBeOK();
  return response.json();
}
