@val external window: Dom.window = "window"
@send
external addEventListener: (Dom.window, string, Dom.keyboardEvent => unit) => unit =
  "addEventListener"

@module("react-firebase-hooks/auth") external useAuthState: 'any = "useAuthState"
@send external toString: Js.t<'a> => string = "toString"

%%raw(`
  import "firebase/compat/app";
  import "firebase/compat/firestore";
`)

let loggerMiddleware = (store, next, action) => {
  Js.log(action)
  next(action)
  Js.log(Reductive.Store.getState(store))
}

let enhancer = ReductiveDevTools.Connectors.enhancer(
  ~options=ReductiveDevTools.Extension.enhancerOptions(~name="rejysten", ()),
  ~devToolsUpdateActionCreator=state => Action.DevToolUpdate({state: state}),
  (),
)

let store = enhancer(Reductive.Store.create)(
  ~reducer=Reducer.reducer,
  ~preloadedState=State.initialState,
  ~enhancer=(store, next) =>
    next
    ->FirestoreMiddleware.middleware(store, _)
    ->EventMiddleware.middleware(store, _)
    ->loggerMiddleware(store, _),
  (),
)

module KeyDownHandler = {
  @react.component
  let make = React.memo(() => {
    let dispatch = Redux.useDispatch()

    React.useEffect1(() => {
      let listener = event => {
        Js.log("onKeydown")
        dispatch(Action.Event(Event.KeyDown({event: event})))
      }

      window->addEventListener("keydown", listener)

      None
    }, [])

    React.null
  })

  React.setDisplayName(make, "KeyDownHandler")
}

module Main = {
  @react.component
  let make = () => {
    let focus = Redux.useSelector(Selector.focus)

    <div className=Style.Main.style>
      <div className=Style.Main.content>
        {switch focus {
        | State.Note(_) => <Note />
        | State.Search() => <Search />
        | State.ActionLog(focus) => <ActionLog focus />
        }}
      </div>
      <div className=Style.Main.buttonBar> <ButtonBar /> </div>
    </div>
  }
}

module App = {
  @react.component
  let make = () => {
    let (user, initializing, error) = useAuthState(Firebase.auth)
    let user = user->Js.toOption

    React.useEffect1(() => {
      if !initializing {
        switch error {
        | Some(_) => ()

        | None =>
          switch user {
          | Some(_) => ()

          | None =>
            let provider = Firebase.Auth.googleAuthProvider()
            Firebase.auth->Firebase.Auth.signInWithPopup(provider)
          }
        }
      }

      None
    }, [user, initializing])

    if initializing {
      "initializing"->React.string
    } else {
      switch error {
      | Some(error) => error->toString->React.string
      | None =>
        switch user {
        | Some(_) => <> <Main /> <SyncFirestoreState /> </>

        | None => "logging in"->React.string
        }
      }
    }
  }
}

switch ReactDOM.querySelector("#app") {
| Some(app) =>
  ReactDOM.render(<Redux.Provider store> {<> <App /> <KeyDownHandler /> </>} </Redux.Provider>, app)

| None => ()
}
