import DaiRecoveryFormal.Spec

set_option autoImplicit false

namespace DaiRecoveryFormal

inductive MerkleTree (α : Type) where
  | leaf : α → MerkleTree α
  | node : MerkleTree α → Option (MerkleTree α) → MerkleTree α
deriving Repr

namespace MerkleTree

variable {α : Type} [LinearOrder α] [HashModel α]

def root : MerkleTree α → α
  | leaf value => value
  | node left none => hashPair (root left) (root left)
  | node left (some right) => hashPair (root left) (root right)

def leafCount : MerkleTree α → Nat
  | leaf _ => 1
  | node left none => leafCount left
  | node left (some right) => leafCount left + leafCount right

inductive MembershipProof : MerkleTree α → α → List α → Prop where
  | here (value : α) :
      MembershipProof (.leaf value) value []
  | duplicate {childTree : MerkleTree α} {leaf : α} {proof : List α} :
      MembershipProof childTree leaf proof →
      MembershipProof (.node childTree none) leaf (proof ++ [root childTree])
  | left {leftTree rightTree : MerkleTree α} {leaf : α} {proof : List α} :
      MembershipProof leftTree leaf proof →
      MembershipProof (.node leftTree (some rightTree)) leaf (proof ++ [root rightTree])
  | right {leftTree rightTree : MerkleTree α} {leaf : α} {proof : List α} :
      MembershipProof rightTree leaf proof →
      MembershipProof (.node leftTree (some rightTree)) leaf (proof ++ [root leftTree])

theorem processProof_eq_root_of_membership
    {tree : MerkleTree α} {leaf : α} {proof : List α}
    (h : MembershipProof tree leaf proof) :
    processProof leaf proof = root tree := by
  induction h with
  | here _ =>
      rfl
  | duplicate hProof ih =>
      rw [processProof_append, ih, processProof_singleton, root]
  | left hProof ih =>
      rw [processProof_append, ih, processProof_singleton, root]
  | right hProof ih =>
      rw [processProof_append, ih, processProof_singleton, hashPair_comm, root]

theorem verify_of_membership
    {tree : MerkleTree α} {leaf : α} {proof : List α}
    (h : MembershipProof tree leaf proof) :
    verify (root tree) leaf proof := by
  exact processProof_eq_root_of_membership h

def proofAt? : MerkleTree α → Nat → Option (α × List α)
  | leaf value, 0 => some (value, [])
  | leaf _, _ + 1 => none
  | node left none, index =>
      match proofAt? left index with
      | some (foundLeaf, proof) => some (foundLeaf, proof ++ [root left])
      | none => none
  | node left (some right), index =>
      if index < leafCount left then
        match proofAt? left index with
        | some (foundLeaf, proof) => some (foundLeaf, proof ++ [root right])
        | none => none
      else
        match proofAt? right (index - leafCount left) with
        | some (foundLeaf, proof) => some (foundLeaf, proof ++ [root left])
        | none => none

theorem verify_of_proofAt?
    : (tree : MerkleTree α) → {index : Nat} → {foundLeaf : α} → {proofPath : List α} →
        proofAt? tree index = some (foundLeaf, proofPath) →
        verify (root tree) foundLeaf proofPath
  | .leaf value, 0, foundLeaf, proofPath, h => by
      simp [proofAt?, verify] at h ⊢
      rcases h with ⟨rfl, rfl⟩
      rfl
  | .leaf _, _ + 1, _, _, h => by
      simp [proofAt?] at h
  | .node left none, index, foundLeaf, proofPath, h => by
      simp [proofAt?] at h
      cases hLeft : proofAt? left index with
      | none =>
          simp [hLeft] at h
      | some result =>
          cases result with
          | mk innerLeaf innerProof =>
              simp [hLeft] at h
              rcases h with ⟨rfl, rfl⟩
              rw [verify, processProof_append, processProof_singleton, root]
              simpa [verify] using
                congrArg (fun x => hashPair x left.root) (verify_of_proofAt? left hLeft)
  | .node left (some right), index, foundLeaf, proofPath, h => by
      by_cases hIndex : index < leafCount left
      · simp [proofAt?, hIndex] at h
        cases hLeft : proofAt? left index with
        | none =>
            simp [hLeft] at h
        | some result =>
            cases result with
            | mk innerLeaf innerProof =>
                simp [hLeft] at h
                rcases h with ⟨rfl, rfl⟩
                rw [verify, processProof_append, processProof_singleton, root]
                simpa [verify] using
                  congrArg (fun x => hashPair x right.root) (verify_of_proofAt? left hLeft)
      · simp [proofAt?, hIndex] at h
        cases hRight : proofAt? right (index - leafCount left) with
        | none =>
            simp [hRight] at h
        | some result =>
            cases result with
            | mk innerLeaf innerProof =>
                simp [hRight] at h
                rcases h with ⟨rfl, rfl⟩
                rw [verify, processProof_append, processProof_singleton, hashPair_comm, root]
                simpa [verify] using
                  congrArg (fun x => hashPair left.root x) (verify_of_proofAt? right hRight)

def pairForest : List (MerkleTree α) → List (MerkleTree α)
  | [] => []
  | [tree] => [MerkleTree.node tree none]
  | left :: right :: rest => MerkleTree.node left (some right) :: pairForest rest

def buildForest : Nat → List (MerkleTree α) → List (MerkleTree α)
  | 0, forest => forest
  | fuel + 1, forest =>
      if forest.length ≤ 1 then
        forest
      else
        buildForest fuel (pairForest forest)

def buildFromLeaves (leaves : List α) : Option (MerkleTree α) :=
  match leaves.map MerkleTree.leaf with
  | [] => none
  | forest =>
      match buildForest forest.length forest with
      | [tree] => some tree
      | _ => none

end MerkleTree

end DaiRecoveryFormal
