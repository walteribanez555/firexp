import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { episodeSchema, type EpisodeFormValues } from '../schemas/series.schema';
import type { EpisodeSummary } from '@fire-stick/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EpisodeSummary | null;
  onSubmit: (values: EpisodeFormValues) => void;
  isPending: boolean;
}

export function EpisodeDialog({ open, onOpenChange, editing, onSubmit, isPending }: Props) {
  const form = useForm<EpisodeFormValues>({
    resolver: zodResolver(episodeSchema),
    defaultValues: { title: '' },
  });

  useEffect(() => {
    form.reset({ title: editing ? editing.title : '' });
  }, [editing, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Episode' : 'Add Episode'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              The episode number is assigned automatically (unique per series).
            </p>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Episode title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : editing ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
