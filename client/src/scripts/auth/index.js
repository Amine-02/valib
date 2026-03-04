import { bindSignInForm, bindSignUpForm } from './controller.js';

export async function setupSignIn() {
  bindSignInForm();
}

export async function setupSignUp() {
  await bindSignUpForm();
}
