open Belt

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

let getTimeStringForDisplay = date => {
  if date->toUnixtimeMillis == 0.0 {
    "N/A"
  } else {
    date->formatTime
  }
}

let getTimeStringForEdit = date => {
  open Js.Date

  if date->toUnixtimeMillis == 0.0 {
    ""
  } else {
    Printf.sprintf("%02g%02g%02g", date->getHours, date->getMinutes, date->getSeconds)
  }
}

let parseEditString = (dateString, timeEditString) => {
  switch timeEditString->Js.String2.length {
  | 0 => Some(0.0->fromUnixtimeMillis)

  | 4 =>
    let hours = timeEditString->Js.String2.substrAtMost(~from=0, ~length=2)->Float.fromString
    let minutes = timeEditString->Js.String2.substrAtMost(~from=2, ~length=2)->Float.fromString

    switch (hours, minutes) {
    | (Some(hours), Some(minutes)) =>
      let date = dateString->fromString
      let _ = date->Js.Date.setHoursM(~hours, ~minutes, ())

      Some(date)

    | _ => None
    }

  | 6 =>
    let hours = timeEditString->Js.String2.substrAtMost(~from=0, ~length=2)->Float.fromString
    let minutes = timeEditString->Js.String2.substrAtMost(~from=2, ~length=2)->Float.fromString
    let seconds = timeEditString->Js.String2.substrAtMost(~from=4, ~length=2)->Float.fromString

    switch (hours, minutes, seconds) {
    | (Some(hours), Some(minutes), Some(seconds)) =>
      let date = dateString->fromString
      let _ = date->Js.Date.setHoursMS(~hours, ~minutes, ~seconds, ())

      Js.log((hours, minutes, seconds))
      Js.log(date)

      Some(date)

    | _ => None
    }

  | _ => None
  }
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
