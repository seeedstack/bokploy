import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { GlobeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { api } from "@/utils/api";

const schema = z.object({
	env: z.string().optional(),
});

type Schema = z.infer<typeof schema>;

interface Props {
	children?: React.ReactNode;
}

// Global (organization-wide) environment variables. Lowest precedence in the
// inheritance chain: Global → Server → Project → Environment → Service.
export const GlobalEnvironment = ({ children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { data: organization } = api.organization.active.useQuery();
	const { mutateAsync, error, isError, isPending } =
		api.organization.update.useMutation();

	const form = useForm<Schema>({
		defaultValues: { env: "" },
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (organization) {
			form.reset({ env: organization.env ?? "" });
		}
	}, [organization, form, form.reset]);

	const onSubmit = async (formData: Schema) => {
		if (!organization) return;
		await mutateAsync({
			organizationId: organization.id,
			name: organization.name,
			env: formData.env || "",
		})
			.then(() => {
				toast.success("Global env updated successfully");
				utils.organization.active.invalidate();
			})
			.catch(() => {
				toast.error("Error updating the global env");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<Button variant="outline">
						<GlobeIcon className="size-4" />
						Global Environment
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>Global Environment</DialogTitle>
					<DialogDescription>
						Variables shared across every project in this organization. They are
						inherited by services (in projects with inheritance enabled) and
						overridden by more specific scopes.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<AlertBlock type="info">
					Reference these in service environments with{" "}
					<code>DATABASE_URL=${"{{organization.DATABASE_URL}}"}</code>
				</AlertBlock>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="env"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Environment variables</FormLabel>
									<FormControl>
										<CodeEditor
											lineWrapping
											language="properties"
											wrapperClassName="h-[35rem] font-mono"
											placeholder={"NODE_ENV=production\nSENTRY_DSN=..."}
											value={field.value ?? ""}
											onChange={field.onChange}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button isLoading={isPending} type="submit">
								Update
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
