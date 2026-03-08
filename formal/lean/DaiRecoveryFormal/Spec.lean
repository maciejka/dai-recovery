import Mathlib

set_option autoImplicit false

namespace DaiRecoveryFormal

abbrev Address := Nat
abbrev Amount := Nat

structure Claim where
  account : Address
  totalAmount : Amount
deriving DecidableEq, Repr

class HashModel (α : Type) where
  hashLeaf : Claim → α
  compress : α → α → α

section Core

variable {α : Type} [LinearOrder α] [HashModel α]

def hashPair (left right : α) : α :=
  HashModel.compress (min left right) (max left right)

theorem hashPair_comm (left right : α) :
    hashPair left right = hashPair right left := by
  simp [hashPair, min_comm, max_comm]

def processProof (leaf : α) (proof : List α) : α :=
  proof.foldl hashPair leaf

def verify (root leaf : α) (proof : List α) : Prop :=
  processProof leaf proof = root

theorem processProof_nil (leaf : α) :
    processProof leaf [] = leaf := by
  rfl

theorem processProof_cons (leaf sibling : α) (proof : List α) :
    processProof leaf (sibling :: proof) = processProof (hashPair leaf sibling) proof := by
  rfl

theorem processProof_singleton (leaf sibling : α) :
    processProof leaf [sibling] = hashPair leaf sibling := by
  rfl

theorem processProof_append (leaf : α) (leftProof rightProof : List α) :
    processProof leaf (leftProof ++ rightProof) =
      processProof (processProof leaf leftProof) rightProof := by
  induction leftProof generalizing leaf rightProof with
  | nil =>
      rfl
  | cons sibling rest ih =>
      simpa [List.cons_append, processProof_cons] using
        ih (leaf := hashPair leaf sibling) (rightProof := rightProof)

end Core

end DaiRecoveryFormal
