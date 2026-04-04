# wallets shell completion - bash
# Source this file from your .bashrc: source /path/to/open-wallets/completions/wallets.bash

_wallets_completions() {
  local cur prev words cword
  _init_completion || return

  case "${words[1]}" in
    wallets)
      COMPREPLY=($(compgen -W "provider card agent doctor transaction ping audit completions help version" -- "$cur"))
      ;;
    provider)
      COMPREPLY=($(compgen -W "add list remove" -- "$cur"))
      ;;
    card)
      COMPREPLY=($(compgen -W "create create-batch list details close close-batch freeze unfreeze rename profile" -- "$cur"))
      ;;
    agent)
      COMPREPLY=($(compgen -W "register list" -- "$cur"))
      ;;
    doctor)
      COMPREPLY=($(compgen -W "check" -- "$cur"))
      ;;
    transaction)
      COMPREPLY=($(compgen -W "list" -- "$cur"))
      ;;
    ping)
      COMPREPLY=()
      ;;
    audit)
      COMPREPLY=($(compgen -W "list" -- "$cur"))
      ;;
    completions)
      COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur"))
      ;;
  esac
}

complete -F _wallets_completions wallets
