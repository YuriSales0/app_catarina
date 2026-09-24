import { PageHeader } from "@/components/ui";
import { StudioForm } from "@/components/forms/studio-form";
import { getAIProvider } from "@/lib/ai";

const TEMPLATE = `schema_version: curriculum-file.v1
subject: english
subject_name: English
slug: my-family-english
name: My family English
version: 1.0.0
source: FAMILY
visibility: PRIVATE
instruction_language: pt-BR
target_language: en
skills:
  - key: speaking
    name: Speaking
error_tags:
  NEG_AUX_MISSING: Negative without the auxiliary (I no have)
units:
  - key: U1
    name: First unit
    objectives:
      - key: EN.U1.HAVE
        title: "I have..."
        difficulty: 1
        skills: [speaking]
      - key: EN.U1.HAVE_NEG
        title: "I don't have..."
        difficulty: 2
        skills: [speaking]
        prerequisites: [EN.U1.HAVE]
        error_tags: [NEG_AUX_MISSING]
`;

export default async function NewCurriculumPage() {
  const provider = await getAIProvider();
  return (
    <>
      <PageHeader
        eyebrow="Currículos"
        title="Estúdio de currículo"
        crumbs={[{ href: "/curricula", label: "Currículos" }]}
        subtitle="Cole um currículo em YAML, valide, revise os objetivos e salve como rascunho ou publique. Quem quer que tenha escrito o YAML, ele passa pelas mesmas verificações."
      />
      <StudioForm template={TEMPLATE} aiEnabled={provider.id !== "null"} />
    </>
  );
}
