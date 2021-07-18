open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let searchItems = (itemMap, searchingText) => {
    if searchingText == "" {
      []
    } else {
      itemMap
      ->Map.String.keep((_, item: State.item) => {
        item.text->Js.String2.includes(searchingText)
      })
      ->Map.String.toArray
      ->Array.map(((_, item)) => item)
    }
  }
)

@react.component
let make = () => {
  let dispatch = Redux.useDispatch()
  let itemMap = Redux.useSelector(State.Firestore.itemMap)
  let searchingText = Redux.useSelector(State.Search.searchingText)
  let (searchingText, ()) = Hook.useDebounce(searchingText, 200)

  React.useEffect2(() => {
    dispatch(Action.SetSearchState({items: searchItems(itemMap, searchingText)}))

    None
  }, (itemMap, searchingText))

  React.null
}
