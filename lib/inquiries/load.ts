import "server-only";
import { createSupabaseInquiryStore } from "./supabaseStore";
import { buildInquiryViews, buildTemplateViews, type InquiryView, type TemplateView } from "./view";

/** Page data for /learners/:id/inquiries. Call requireAccess (authorizeInquiriesPage) first. */
export async function loadInquiriesPage(
  learnerId: string,
  trackId: string,
): Promise<{ templates: TemplateView[]; inquiries: InquiryView[] }> {
  const store = createSupabaseInquiryStore();
  const [templates, data] = await Promise.all([store.listPublishedTemplates(trackId), store.listInstances(learnerId)]);
  return {
    templates: buildTemplateViews(templates),
    inquiries: buildInquiryViews(data.instances, data.activities, data.events),
  };
}
