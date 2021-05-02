@send external getBoundingClientRect: Dom.element => {"left": int, "right": int, "top": int, "bottom": int} = "getBoundingClientRect"
@send external scrollIntoView: (Dom.element, {"behavior": string, "block": string, "inline": string}) => unit = "scrollIntoView"
@val @bs.scope("window") external innerHeight: int = "innerHeight"

@react.component
let make = React.memo((~item: State.documentItem) => {
  let currentDocumentItemId = Redux.useSelector(State.DocumentItemPane.currentId)
  let spanRef = React.useRef(Js.Nullable.null)

  let isCurrentItem = item.id == currentDocumentItemId

  React.useEffect1(() => {
    if isCurrentItem {
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
  }, [isCurrentItem])

  <span ref={ReactDOM.Ref.domRef(spanRef)}> {item.text->React.string} </span>
})

React.setDisplayName(make, "Item")
