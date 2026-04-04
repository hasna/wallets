# wallets shell completion - fish
# Add to ~/.config/fish/config.fish:
#   mkdir -p $HOME/.config/fish/completions
#   cp /path/to/open-wallets/completions/wallets.fish $HOME/.config/fish/completions/

complete -c wallets -n '__fish_use_subcommand' -a provider -d 'Manage wallet providers'
complete -c wallets -n '__fish_use_subcommand' -a card -d 'Manage virtual cards'
complete -c wallets -n '__fish_use_subcommand' -a agent -d 'Manage AI agents'
complete -c wallets -n '__fish_use_subcommand' -a doctor -d 'Run health diagnostics'
complete -c wallets -n '__fish_use_subcommand' -a transaction -d 'View transaction history'
complete -c wallets -n '__fish_use_subcommand' -a help -d 'Show help'

# Provider subcommands
complete -c wallets -n '__fish_seen_subcommand_from provider' -a add -d 'Register a wallet provider'
complete -c wallets -n '__fish_seen_subcommand_from provider' -a list -d 'List registered providers'
complete -c wallets -n '__fish_seen_subcommand_from provider' -a remove -d 'Remove a provider'

# Card subcommands
complete -c wallets -n '__fish_seen_subcommand_from card' -a create -d 'Create a new funded virtual card'
complete -c wallets -n '__fish_seen_subcommand_from card' -a create-batch -d 'Create multiple cards at once'
complete -c wallets -n '__fish_seen_subcommand_from card' -a list -d 'List all cards'
complete -c wallets -n '__fish_seen_subcommand_from card' -a details -d 'Get full card details including PAN and CVV'
complete -c wallets -n '__fish_seen_subcommand_from card' -a close -d 'Close a card permanently'
complete -c wallets -n '__fish_seen_subcommand_from card' -a close-batch -d 'Close multiple cards at once'
complete -c wallets -n '__fish_seen_subcommand_from card' -a freeze -d 'Freeze a card temporarily'
complete -c wallets -n '__fish_seen_subcommand_from card' -a unfreeze -d 'Unfreeze a frozen card'
complete -c wallets -n '__fish_seen_subcommand_from card' -a rename -d 'Rename a card'
complete -c wallets -n '__fish_seen_subcommand_from card' -a profile -d 'Update card category/profile'

# Agent subcommands
complete -c wallets -n '__fish_seen_subcommand_from agent' -a register -d 'Register an AI agent'
complete -c wallets -n '__fish_seen_subcommand_from agent' -a list -d 'List all agents'

# Transaction subcommands
complete -c wallets -n '__fish_seen_subcommand_from transaction' -a list -d 'List card transactions'

# Global options
complete -c wallets -l json -d 'Output as JSON'
complete -c wallets -l filter -d 'JMESPath filter to apply to JSON output'
complete -c wallets -s q -l quiet -d 'Suppress all output except errors'
complete -c wallets -s s -l silent -d 'Same as --quiet'
complete -c wallets -s h -l help -d 'Show help'
complete -c wallets -s V -l version -d 'Show version'
