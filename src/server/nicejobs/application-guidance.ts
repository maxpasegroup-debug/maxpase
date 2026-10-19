import type { FormConfiguration } from "./application-configuration";

export function applicationFieldHint(field: FormConfiguration["fields"][number]) {
  switch (field.type) {
    case "TEXTAREA": return "Use your own words and include relevant examples. You can save a draft and return later.";
    case "NUMBER": return "Enter an accurate number. Use zero only when that is your actual answer.";
    case "DATE": return "Select the actual calendar date.";
    case "SELECT": return "Choose the option that accurately describes you.";
    case "MULTI_SELECT": return "Choose all options that accurately describe you.";
    case "BOOLEAN": return "Choose Yes or No based on your actual circumstances.";
    case "EMAIL": return "Enter an email address you can access.";
    case "PHONE": return "Include the country code for your contact number.";
    case "DOCUMENT_REFERENCE": return "Use the document reference supplied by the hiring team. This field does not upload a file.";
    default: return "Answer accurately. Leave optional questions blank if they do not apply.";
  }
}

export function applicantQuestion(message: string) {
  return ["help me complete this application", "explain the application questions", "what happens after i submit?", "show the published opportunity terms"].includes(message.trim().toLowerCase());
}
