@send external getBoundingClientRect: Dom.element => {"left": int, "right": int, "top": int, "bottom": int} = "getBoundingClientRect"
@send external scrollIntoView: (Dom.element, {"behavior": string, "block": string, "inline": string}) => unit = "scrollIntoView"
@val @bs.scope("window") external innerHeight: int = "innerHeight"

@react.component
let make = React.memo((~document: State.document) => {
  let currentDocumentId = Redux.useSelector(State.DocumentPane.currentId)
  let focus = Redux.useSelector(State.focus)
  let spanRef = React.useRef(Js.Nullable.null)

  let isCurrentDocument = document.id == currentDocumentId

  React.useEffect1(() => {
    if isCurrentDocument {
      spanRef.current
      ->Js.Nullable.toOption
      ->Belt.Option.forEach(span => {
        let rect = span->getBoundingClientRect
        if rect["top"] < 0 {
          span->scrollIntoView({"behavior": "auto", "block": "start", "inline": "nearest"})
        }

        if rect["bottom"] > innerHeight {
          span->scrollIntoView({"behavior": "auto", "block": "end", "inline": "nearest"})
        }
      })
    }

    None
  }, [isCurrentDocument])

  <span ref={ReactDOM.Ref.domRef(spanRef)}> {document.text->React.string} </span>
})
