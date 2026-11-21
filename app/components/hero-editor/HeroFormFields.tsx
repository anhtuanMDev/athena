import { DynamicFieldsRenderer } from "~/components/views/DynamicFieldsRenderer";
import { HERO_OWN_KEYS } from "~/lib/hero-form";

import { HeroIdentityFields } from "./HeroIdentityFields";
import { HeroPortraits } from "./HeroPortraits";

import type { useHeroForm } from "./hooks/useHeroForm";

interface HeroFormFieldsProps {
  game: string;
  stage: "new" | "edit";
  form: ReturnType<typeof useHeroForm>;
}

/** The hero's name and id, its portraits, and its schema's fields. */
export function HeroFormFields({ game, stage, form }: HeroFormFieldsProps) {
  const { methods } = form;
  return (
    <>
      <HeroIdentityFields stage={stage} />
      <HeroPortraits portraits={form.portraits} onChange={form.setPortraits} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <DynamicFieldsRenderer fields={form.fields} game={game} abilityIcons={form.abilityIcons} setAbilityIcons={form.setAbilityIcons} control={methods.control} register={methods.register} errors={methods.formState.errors} skipFields={HERO_OWN_KEYS} />
      </div>
    </>
  );
}
