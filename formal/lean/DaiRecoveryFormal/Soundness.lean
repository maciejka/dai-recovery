import DaiRecoveryFormal.Spec

set_option autoImplicit false

namespace DaiRecoveryFormal

section Soundness

variable {α : Type} [LinearOrder α] [HashModel α]

def StepInjective (α : Type) [LinearOrder α] [HashModel α] : Prop :=
  ∀ sibling : α, Function.Injective (fun current => hashPair current sibling)

theorem processProof_injective_of_stepInjective
    (hStep : StepInjective α) (proof : List α) :
    Function.Injective (fun leaf => processProof leaf proof) := by
  induction proof with
  | nil =>
      intro left right hEq
      simpa [processProof] using hEq
  | cons sibling rest ih =>
      intro left right hEq
      apply hStep sibling
      apply ih
      simpa [processProof_cons] using hEq

theorem claim_eq_of_same_proof_verification
    (hLeafInjective : Function.Injective (HashModel.hashLeaf (α := α)))
    (hStep : StepInjective α)
    {root : α}
    {claim₁ claim₂ : Claim}
    {proof : List α}
    (hClaim₁ : verify root ((HashModel.hashLeaf (α := α)) claim₁) proof)
    (hClaim₂ : verify root ((HashModel.hashLeaf (α := α)) claim₂) proof) :
    claim₁ = claim₂ := by
  apply hLeafInjective
  have hInjective := processProof_injective_of_stepInjective hStep proof
  apply hInjective
  exact hClaim₁.trans hClaim₂.symm

theorem wrong_claim_same_proof_impossible
    (hLeafInjective : Function.Injective (HashModel.hashLeaf (α := α)))
    (hStep : StepInjective α)
    {root : α}
    {claim₁ claim₂ : Claim}
    {proof : List α}
    (hDistinct : claim₁ ≠ claim₂)
    (hClaim₁ : verify root ((HashModel.hashLeaf (α := α)) claim₁) proof) :
    ¬ verify root ((HashModel.hashLeaf (α := α)) claim₂) proof := by
  intro hClaim₂
  apply hDistinct
  exact claim_eq_of_same_proof_verification hLeafInjective hStep hClaim₁ hClaim₂

end Soundness

end DaiRecoveryFormal
