define greentext
	'\033[1;32m$(1)\033[0m'
endef
define cyantext
	'\033[1;96m$(1)\033[0m'
endef

.PHONY: default all clean test

TARGETS = houston-common-lib/dist/index.js houston-common-ui/dist/index.js

default: $(TARGETS)

all: default

.SECONDEXPANSION:
$(TARGETS): %/dist/index.js: $$(shell find '$$*' -type d \( -name node_modules -o -path '$$*/dist' -o -path '*node_modules*'  \) -prune -o -type f -not \( -name .gitignore \) -print)
	@echo -e $(call cyantext,Building $*)
	yarn --cwd $* install
	yarn --cwd $* build
	@echo -e $(call greentext,Done building $*)
	@echo

houston-common-ui/dist/index.js: houston-common-lib/dist/index.js

test: FORCE
	yarn --cwd houston-common-lib run test

clean:
	find . -name dist -type d -exec rm -rf {} \; -prune

FORCE:
