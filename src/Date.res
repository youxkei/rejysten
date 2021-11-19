type t = Js.Date.t

let now = Js.Date.make
let fromString = Js.Date.fromString

let fromUnixtimeMillis = unixtimeMillis => unixtimeMillis->Js.Date.fromFloat
let toUnixtimeMillis = date => date->Js.Date.getTime

let formatDate = date => {
  open Js.Date

  Printf.sprintf("%04g-%02g-%02g", date->getFullYear, date->getMonth +. 1.0, date->getDate)
}

let formatTime = date => {
  open Js.Date

  Printf.sprintf("%02g:%02g:%02g", date->getHours, date->getMinutes, date->getSeconds)
}

let before = (lhs, rhs) => {
  open Js.Date

  let lhsYear = lhs->getFullYear
  let rhsYear = rhs->getFullYear
  let lhsMonth = lhs->getMonth
  let rhsMonth = rhs->getMonth
  let lhsDate = lhs->getDate
  let rhsDate = rhs->getDate

  if lhsYear < rhsYear {
    true
  } else if lhsYear > rhsYear {
    false
  } else if lhsMonth < rhsMonth {
    true
  } else if lhsMonth > rhsMonth {
    false
  } else if lhsDate < rhsDate {
    true
  } else if lhsDate > rhsDate {
    false
  } else {
    false
  }
}
