import { bindSignInForm, bindSignUpForm } from './controller.js';

export async function setupSignIn() {
  await bindSignInForm();
}

export async function setupSignUp() {
  await bindSignUpForm();
}
