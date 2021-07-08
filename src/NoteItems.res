open Belt

@send
external getBoundingClientRect: Dom.element => {
  "left": int,
  "right": int,
  "top": int,
  "bottom": int,
} = "getBoundingClientRect"
@send
external scrollIntoView: (
  Dom.element,
  {"behavior": string, "block": string, "inline": string},
) => unit = "scrollIntoView"
@val @scope("window") external innerHeight: int = "innerHeight"

%%private(
  let makeChildren = (itemMap, item: State.item) => {
    let children = []

    let currentItem = ref(itemMap->Map.String.get(item.firstChildId))

    while Option.isSome(currentItem.contents) {
      let item: State.item = Option.getExn(currentItem.contents)

      let _ = children->Js.Array2.push(item)
      currentItem := itemMap->Map.String.get(item.nextId)
    }

    children
  }
)

module rec ItemsInner: {
  let make: {"item": State.item} => ReasonReact.reactElement
  let makeProps: (~item: State.item, ~key: string=?, unit) => {"item": State.item}
} = {
  @react.component
  let make = React.memo((~item: State.item) => {
    let focus = Redux.useSelector(State.focus)
    let mode = Redux.useSelector(State.mode)
    let itemMap = Redux.useSelector(State.Note.ItemPane.itemMap)
    let currentItemId = Redux.useSelector(State.Note.ItemPane.currentItemId)
    let liRef = React.useRef(Js.Nullable.null)

    let isCurrentItem = item.id == currentItemId

    React.useEffect1(() => {
      if isCurrentItem {
        liRef.current
        ->Js.Nullable.toOption
        ->Option.forEach(li => {
          let rect = li->getBoundingClientRect

          if rect["top"] < 0 {
            li->scrollIntoView({"behavior": "auto", "block": "start", "inline": "nearest"})
          }

          if rect["bottom"] > innerHeight {
            li->scrollIntoView({"behavior": "auto", "block": "end", "inline": "nearest"})
          }
        })
      }

      None
    }, [isCurrentItem])

    let className = if isCurrentItem {
      Style.focused
    } else {
      ""
    }

    <>
      <p className ref={ReactDOM.Ref.domRef(liRef)}>
        {React.string("-")}
        {switch (focus, mode, isCurrentItem) {
        | (State.Note(State.ItemPane()), State.Insert(_), true) => <NoteItemEditor />

        | _ => <Item item />
        }}
      </p>
      {makeChildren(itemMap, item)
      ->Array.map((item: State.item) => {
        <ItemsInner key=item.id item />
      })
      ->React.array}
    </>
  })

  React.setDisplayName(make, "ItemsInner")
}

@react.component
let make = React.memo((~item: State.item) => {
  let itemMap = Redux.useSelector(State.Note.ItemPane.itemMap)

  makeChildren(itemMap, item)
  ->Array.map(item => {
    <ItemsInner key=item.id item />
  })
  ->React.array
})

React.setDisplayName(make, "Items")
