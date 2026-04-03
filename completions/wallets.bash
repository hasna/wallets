# wallets shell completion - bash
# Source this file from your .bashrc: source /path/to/wallets/completions/wallets.bash

_wallets_completions() {
  local cur prev words cword
  _init_completion || return

  case "${words[1]}" in
    wallets)
      COMPREPLY=($(compgen -W "provider card agent doctor transaction help version" -- "$cur"))
      ;;
    provider)
      COMPREPLY=($(compgen -W "add list remove help" -- "$cur"))
      ;;
    card)
      COMPREPLY=($(compgen -W "create list details close freeze unfreeze stats profile help" -- "$cur"))
      ;;
    agent)
      COMPREPLY=($(compgen -W "register list help" -- "$cur"))
      ;;
    doctor)
      COMPREPLY=($(compgen -W "check help" -- "$cur"))
      ;;
    transaction)
      COMPREPLY=($(compgen -W "list help" -- "$cur"))
      ;;
  esac
}

complete -F _wallets_completions wallets
