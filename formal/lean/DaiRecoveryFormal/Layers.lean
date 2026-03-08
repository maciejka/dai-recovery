import DaiRecoveryFormal.Spec

set_option autoImplicit false

namespace DaiRecoveryFormal

namespace MerkleLayers

variable {α : Type} [LinearOrder α] [HashModel α]

def pairLayer : List α → List α
  | [] => []
  | [value] => [hashPair value value]
  | left :: right :: rest => hashPair left right :: pairLayer rest

def buildLayersAux : Nat → List α → List (List α)
  | 0, current => [current]
  | fuel + 1, current =>
      if current.length ≤ 1 then
        [current]
      else
        current :: buildLayersAux fuel (pairLayer current)

def buildLayers (leaves : List α) : Option (List (List α)) :=
  match leaves with
  | [] => none
  | current => some (buildLayersAux current.length current)

def siblingIndex (levelLength currentIndex : Nat) : Nat :=
  let candidate :=
    if currentIndex % 2 = 0 then
      currentIndex + 1
    else
      currentIndex - 1

  if candidate < levelLength then
    candidate
  else
    currentIndex

def siblingAt? (level : List α) (currentIndex : Nat) : Option α :=
  level[siblingIndex level.length currentIndex]?

def createProof : List (List α) → Nat → Option (List α)
  | [], _ => none
  | [_], _ => some []
  | level :: next :: rest, currentIndex =>
      match siblingAt? level currentIndex, createProof (next :: rest) (currentIndex / 2) with
      | some sibling, some tail => some (sibling :: tail)
      | _, _ => none

def root? : List (List α) → Option α
  | [] => none
  | levels =>
      match levels.getLast? with
      | some [root] => some root
      | _ => none

theorem pairLayer_nil :
    pairLayer ([] : List α) = [] := by
  rfl

theorem pairLayer_singleton (value : α) :
    pairLayer [value] = [hashPair value value] := by
  rfl

omit [LinearOrder α] [HashModel α] in
theorem createProof_singleton_levels (level : List α) (index : Nat) :
    createProof [level] index = some [] := by
  rfl

end MerkleLayers

end DaiRecoveryFormal
